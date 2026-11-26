import { spawn, type ChildProcess } from "node:child_process";
import type { EngineTransport } from "../../src/web/engine/transport.js";

export class UciProcessTransport implements EngineTransport {
  private readonly child: ChildProcess;
  private readonly listeners = new Set<(line: string) => void>();
  private outputBuffer = "";
  private stderrBuffer = "";
  private readonly stderrTail: string[] = [];
  private closed = false;
  private expectedTermination = false;
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  private failureCause: string | undefined;

  constructor(
    command: string,
    args: string[] = [],
    private readonly onFailure?: (cause: string) => void,
  ) {
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.readChunk(chunk));
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => this.readStderr(chunk));
    this.child.on("error", (error) =>
      this.fail(`spawn error: ${error.message}`),
    );
    this.child.on("exit", (code, signal) => this.handleExit(code, signal));
    this.child.on("close", (code, signal) => this.handleExit(code, signal));
    this.child.stdin?.on("error", (error) => {
      this.fail(`stdin error: ${error.message}`);
    });
  }

  get failure(): string | undefined {
    return this.failureCause;
  }

  send(line: string): void {
    if (this.closed || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error("Engine transport is closed");
    }

    try {
      this.child.stdin.write(`${line}\n`);
    } catch (error) {
      this.fail(
        `stdin error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error("Engine transport is closed", { cause: error });
    }
  }

  onLine(callback: (line: string) => void): () => void {
    if (this.closed) return () => undefined;
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  terminate(): void {
    if (this.closed) return;
    this.expectedTermination = true;
    this.closed = true;
    this.listeners.clear();
    try {
      this.child.stdin?.write("quit\n");
    } catch {
      // The fallback kill below handles a process that no longer accepts input.
    }

    this.killTimer = setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill();
      }
      this.markClosed();
    }, 1_000);
    this.killTimer.unref?.();
  }

  private readChunk(chunk: string): void {
    if (this.closed) return;
    this.outputBuffer += chunk;
    let newlineIndex = this.outputBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      this.deliver(this.outputBuffer.slice(0, newlineIndex));
      this.outputBuffer = this.outputBuffer.slice(newlineIndex + 1);
      newlineIndex = this.outputBuffer.indexOf("\n");
    }
  }

  private readStderr(chunk: string): void {
    this.stderrBuffer += chunk;
    const lines = this.stderrBuffer.split(/\r?\n/);
    this.stderrBuffer = lines.pop() ?? "";
    for (const line of lines) this.rememberStderrLine(line);
  }

  private rememberStderrLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    this.stderrTail.push(trimmed);
    if (this.stderrTail.length > 10) this.stderrTail.shift();
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.expectedTermination) {
      this.markClosed();
      return;
    }
    const status =
      code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
    const stderr = this.getStderrTail();
    this.fail(
      `process exited with ${status}${stderr ? `; stderr tail: ${stderr}` : ""}`,
    );
  }

  private getStderrTail(): string {
    const lines = [...this.stderrTail];
    if (this.stderrBuffer.trim()) lines.push(this.stderrBuffer.trim());
    return lines.slice(-10).join(" | ");
  }

  private deliver(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || this.closed) return;
    for (const listener of this.listeners) listener(trimmed);
  }

  private markClosed(): void {
    this.closed = true;
    this.listeners.clear();
    this.outputBuffer = "";
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = undefined;
    }
  }

  private fail(cause: string): void {
    if (this.failureCause || this.expectedTermination) return;
    this.failureCause = cause;
    this.closed = true;
    this.listeners.clear();
    this.outputBuffer = "";
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = undefined;
    }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      try {
        this.child.kill();
      } catch {
        // A process that already exited needs no further cleanup.
      }
    }
    this.onFailure?.(cause);
  }
}
