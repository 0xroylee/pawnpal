import initEngine from "stockfish";
import type { EngineTransport } from "./transport.js";

type NodeEngine = {
  processCommand: (line: string) => void;
  terminate?: () => void;
  listener?: (message: unknown) => void;
};

export class NodeStockfishTransport implements EngineTransport {
  private readonly listeners = new Set<(line: string) => void>();
  private closed = false;
  private readonly engine: NodeEngine;

  constructor() {
    this.engine = initEngine("lite-single", (message) => {
      if (this.closed) return;
      const text = typeof message === "string" ? message : String(message);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) this.listeners.forEach((listener) => listener(trimmed));
      }
    });
  }

  send(line: string): void {
    if (this.closed) throw new Error("Engine transport is closed");
    this.engine.processCommand(line);
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
    this.engine.terminate?.();
  }
}
