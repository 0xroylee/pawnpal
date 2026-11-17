export interface EngineTransport {
  send(line: string): void;
  onLine(callback: (line: string) => void): () => void;
  terminate(): void;
}

function deliverLines(
  message: unknown,
  callback: (line: string) => void,
): void {
  if (typeof message !== "string") return;
  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) callback(trimmed);
  }
}

export class WorkerTransport implements EngineTransport {
  private readonly worker: Worker;
  private readonly listeners = new Set<(line: string) => void>();
  private closed = false;

  constructor(
    scriptUrl: string,
    workerFactory: (url: string) => Worker = (url) => new Worker(url),
  ) {
    this.worker = workerFactory(scriptUrl);
    this.worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (this.closed) return;
      deliverLines(event.data, (line) =>
        this.listeners.forEach((listener) => listener(line)),
      );
    });
  }

  send(line: string): void {
    if (this.closed) throw new Error("Engine transport is closed");
    this.worker.postMessage(line);
  }

  onLine(callback: (line: string) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  terminate(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.worker.terminate();
  }
}

export type FakeReply = (command: string) => string[] | undefined;

export class FakeTransport implements EngineTransport {
  readonly sent: string[] = [];
  private readonly listeners = new Set<(line: string) => void>();
  private closed = false;

  constructor(private readonly replies: FakeReply = defaultReply) {}

  send(line: string): void {
    if (this.closed) throw new Error("Engine transport is closed");
    this.sent.push(line);
    const replies = this.replies(line) ?? defaultReply(line) ?? [];
    for (const reply of replies) queueMicrotask(() => this.emit(reply));
  }

  onLine(callback: (line: string) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(line: string): void {
    if (this.closed) return;
    deliverLines(line, (value) =>
      this.listeners.forEach((listener) => listener(value)),
    );
  }

  terminate(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

function defaultReply(command: string): string[] | undefined {
  if (command === "uci") return ["uciok"];
  if (command === "isready") return ["readyok"];
  if (command === "stop") return ["bestmove e2e4"];
  if (command.startsWith("go ")) {
    return ["info depth 1 score cp 0 pv e2e4", "bestmove e2e4"];
  }
  return undefined;
}
