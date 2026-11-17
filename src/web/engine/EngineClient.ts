import { Chess } from "chess.js";
import type { EngineTransport } from "./transport.js";
import { parseUciLine } from "./uci.js";

export type EngineErrorCode =
  "not-initialized" | "transport-closed" | "no-move" | "timeout";
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export type AnalyzeOptions = {
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
};
export type EngineLine = {
  uci: string;
  san: string;
  cp?: number;
  mate?: number;
  pv: string[];
  depth: number;
};
export type EngineClientOptions = {
  threads?: number;
  hardwareConcurrency?: number;
  timeoutMs?: number;
};

type SignalWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type ActiveSearch = {
  fen: string;
  lines: Map<
    number,
    Extract<ReturnType<typeof parseUciLine>, { type: "info" }>
  >;
  resolve: (outcome: SearchOutcome) => void;
  reject: (error: Error) => void;
  result: Promise<SearchOutcome>;
  resolveDrained: () => void;
  rejectDrained: (error: Error) => void;
  drained: Promise<void>;
  finished: boolean;
  timedOut: boolean;
  stopSent: boolean;
  timer: ReturnType<typeof setTimeout>;
  drainTimer?: ReturnType<typeof setTimeout>;
};
type SearchOutcome = { bestMove: string | null; lines: EngineLine[] };
type SearchExecution = {
  result: Promise<SearchOutcome>;
  drained: Promise<void>;
};

export class EngineClient {
  private initialized = false;
  private closed = false;
  private initPromise: Promise<void> | null = null;
  private readonly timeoutMs: number;
  private readonly threads: number;
  private readonly signalWaiters = new Map<string, SignalWaiter[]>();
  private activeSearch: ActiveSearch | null = null;
  private analysisTail: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly transport: EngineTransport,
    options: EngineClientOptions = {},
  ) {
    const hardware =
      options.hardwareConcurrency ??
      globalThis.navigator?.hardwareConcurrency ??
      2;
    this.threads = options.threads ?? Math.max(1, hardware - 1);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.unsubscribe = transport.onLine((line) => this.handleLine(line));
  }

  init(): Promise<void> {
    if (this.closed)
      return Promise.reject(
        new EngineError("transport-closed", "Engine transport is closed"),
      );
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await this.sendAndWait("uci", "uciok");
      this.transport.send(`setoption name Threads value ${this.threads}`);
      await this.sendAndWait("isready", "readyok");
      this.initialized = true;
    })().catch((error: unknown) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  async newGame(): Promise<void> {
    this.requireInitialized();
    await this.stop();
    this.transport.send("ucinewgame");
    await this.sendAndWait("isready", "readyok");
  }

  async setOptions(
    options: Record<string, string | number | boolean>,
  ): Promise<void> {
    this.requireInitialized();
    await this.stop();
    for (const [name, value] of Object.entries(options)) {
      this.transport.send(`setoption name ${name} value ${String(value)}`);
    }
    await this.sendAndWait("isready", "readyok");
  }

  analyze(fen: string, options: AnalyzeOptions = {}): Promise<EngineLine[]> {
    return this.enqueueSearch(fen, options).then((outcome) => outcome.lines);
  }

  async bestMove(fen: string, options: AnalyzeOptions = {}): Promise<string> {
    const { bestMove } = await this.enqueueSearch(fen, options);
    if (!bestMove)
      throw new EngineError("no-move", "The position has no legal move");
    return bestMove;
  }

  async stop(): Promise<void> {
    const active = this.activeSearch;
    if (!active || active.finished) return;
    if (!active.stopSent) {
      active.stopSent = true;
      this.send("stop");
    }
    await active.drained;
  }

  terminate(): void {
    if (this.closed) return;
    this.closed = true;
    this.initialized = false;
    this.unsubscribe();
    for (const waiters of this.signalWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(
          new EngineError("transport-closed", "Engine transport is closed"),
        );
      }
    }
    this.signalWaiters.clear();
    const active = this.activeSearch;
    if (active && !active.finished) {
      clearTimeout(active.timer);
      active.finished = true;
      active.reject(
        new EngineError("transport-closed", "Engine transport is closed"),
      );
      active.rejectDrained(
        new EngineError("transport-closed", "Engine transport is closed"),
      );
      if (active.drainTimer) clearTimeout(active.drainTimer);
      this.activeSearch = null;
    }
    this.transport.terminate();
  }

  private enqueueSearch(
    fen: string,
    options: AnalyzeOptions,
  ): Promise<SearchOutcome> {
    try {
      this.requireInitialized();
    } catch (error) {
      return Promise.reject(error);
    }

    const scheduled = this.analysisTail.then(() =>
      this.beginSearch(fen, options),
    );
    this.analysisTail = scheduled.then(
      ({ drained }) =>
        drained.then(
          () => undefined,
          () => undefined,
        ),
      () => undefined,
    );

    const active = this.activeSearch;
    if (active && !active.finished && !active.stopSent) {
      active.stopSent = true;
      try {
        this.send("stop");
      } catch {
        this.terminate();
      }
    }
    return scheduled.then(({ result }) => result);
  }

  private async beginSearch(
    fen: string,
    options: AnalyzeOptions,
  ): Promise<SearchExecution> {
    this.requireInitialized();
    await this.stop();
    this.requireInitialized();
    const multiPv = Math.max(1, Math.floor(options.multiPv ?? 1));
    this.transport.send(`setoption name MultiPV value ${multiPv}`);
    await this.sendAndWait("isready", "readyok");
    this.transport.send(`position fen ${fen}`);

    let resolveResult!: (outcome: SearchOutcome) => void;
    let rejectResult!: (error: Error) => void;
    const result = new Promise<SearchOutcome>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    let resolveDrained!: () => void;
    let rejectDrained!: (error: Error) => void;
    const drained = new Promise<void>((resolve, reject) => {
      resolveDrained = resolve;
      rejectDrained = reject;
    });

    const active: ActiveSearch = {
      fen,
      lines: new Map(),
      resolve: resolveResult,
      reject: rejectResult,
      result,
      resolveDrained,
      rejectDrained,
      drained,
      finished: false,
      timedOut: false,
      stopSent: false,
      timer: setTimeout(
        () => this.timeoutSearch(active),
        Math.max(
          this.timeoutMs,
          options.movetimeMs ? options.movetimeMs + this.timeoutMs : 0,
        ),
      ),
    };
    this.activeSearch = active;
    const go = options.movetimeMs
      ? `go movetime ${Math.max(1, Math.floor(options.movetimeMs))}`
      : `go depth ${Math.max(1, Math.floor(options.depth ?? 8))}`;
    try {
      this.send(go);
    } catch (error) {
      void active.result.catch(() => undefined);
      void active.drained.catch(() => undefined);
      this.terminate();
      throw error;
    }
    return { result: active.result, drained: active.drained };
  }

  private timeoutSearch(active: ActiveSearch): void {
    if (active.finished || active.timedOut) return;
    active.timedOut = true;
    active.reject(new EngineError("timeout", "Engine analysis timed out"));
    if (!active.stopSent) {
      active.stopSent = true;
      try {
        this.send("stop");
      } catch {
        this.terminate();
        return;
      }
    }
    if (active.finished) return;
    active.drainTimer = setTimeout(() => this.terminate(), this.timeoutMs);
  }

  private handleLine(line: string): void {
    const parsed = parseUciLine(line);
    if (!parsed) return;
    if (parsed.type === "uciok" || parsed.type === "readyok") {
      const waiters = this.signalWaiters.get(parsed.type);
      const waiter = waiters?.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      if (waiters?.length === 0) this.signalWaiters.delete(parsed.type);
      return;
    }
    const active = this.activeSearch;
    if (!active || active.finished) return;
    if (parsed.type === "info") {
      if (!active.timedOut) active.lines.set(parsed.multipv, parsed);
    } else if (parsed.type === "bestmove") {
      active.finished = true;
      clearTimeout(active.timer);
      if (active.drainTimer) clearTimeout(active.drainTimer);
      const lines = [...active.lines.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, info]) => toEngineLine(active.fen, info))
        .filter((engineLine): engineLine is EngineLine => engineLine !== null);
      active.resolve({ bestMove: parsed.move, lines });
      active.resolveDrained();
      if (this.activeSearch === active) this.activeSearch = null;
    }
  }

  private sendAndWait(
    command: string,
    signal: "uciok" | "readyok",
  ): Promise<void> {
    if (this.closed)
      return Promise.reject(
        new EngineError("transport-closed", "Engine transport is closed"),
      );
    const promise = new Promise<void>((resolve, reject) => {
      const waiter: SignalWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.removeWaiter(signal, waiter);
          reject(new EngineError("timeout", `Timed out waiting for ${signal}`));
        }, this.timeoutMs),
      };
      const waiters = this.signalWaiters.get(signal) ?? [];
      waiters.push(waiter);
      this.signalWaiters.set(signal, waiters);
    });
    this.send(command);
    return promise;
  }

  private removeWaiter(signal: string, waiter: SignalWaiter): void {
    const waiters = this.signalWaiters.get(signal);
    if (!waiters) return;
    const index = waiters.indexOf(waiter);
    if (index >= 0) waiters.splice(index, 1);
    if (waiters.length === 0) this.signalWaiters.delete(signal);
  }

  private send(line: string): void {
    if (this.closed)
      throw new EngineError("transport-closed", "Engine transport is closed");
    try {
      this.transport.send(line);
    } catch (error) {
      throw new EngineError(
        "transport-closed",
        error instanceof Error ? error.message : "Transport failed",
      );
    }
  }

  private requireInitialized(): void {
    if (this.closed)
      throw new EngineError("transport-closed", "Engine transport is closed");
    if (!this.initialized)
      throw new EngineError(
        "not-initialized",
        "Call init() before using the engine",
      );
  }
}

function toEngineLine(
  fen: string,
  line: Extract<ReturnType<typeof parseUciLine>, { type: "info" }>,
): EngineLine | null {
  const uci = line.pv[0];
  if (!uci) return null;
  const move = {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  };
  let san = uci;
  try {
    san = new Chess(fen).move(move).san;
  } catch {
    // Preserve the coordinate move if a caller supplied a non-FEN test position.
  }
  return {
    uci,
    san,
    ...("cp" in line.score ? { cp: line.score.cp } : { mate: line.score.mate }),
    pv: line.pv,
    depth: line.depth,
  };
}

export function createEngineClient(
  transport: EngineTransport,
  options?: EngineClientOptions,
): EngineClient {
  return new EngineClient(transport, options);
}
