import type { EngineLine } from "../../shared/coach/types.js";
import { FakeTransport, type EngineTransport } from "./transport.js";

export type ReplayRecording = {
  positions: { fen: string; lines: EngineLine[] }[];
};

export function createReplayTransport(
  recording: ReplayRecording,
): EngineTransport {
  const positions = new Map(
    recording.positions.map(({ fen, lines }) => [fenKey(fen), lines]),
  );
  let positionKey: string | undefined;
  let multiPv = 1;

  return new FakeTransport((command) => {
    if (command.startsWith("position fen ")) {
      positionKey = fenKey(command.slice("position fen ".length));
      return [];
    }
    if (command.startsWith("setoption name MultiPV value ")) {
      multiPv = Number(command.slice("setoption name MultiPV value ".length));
      return [];
    }
    if (command.startsWith("setoption ") || command === "ucinewgame") {
      return [];
    }
    if (command === "stop") return ["bestmove (none)"];
    if (command.startsWith("go ")) {
      const lines = positions.get(positionKey ?? "");
      if (!lines?.length) return ["bestmove (none)"];
      return [
        ...lines.slice(0, multiPv).map((line, index) => {
          const score =
            line.mate !== undefined
              ? `mate ${line.mate}`
              : `cp ${line.cp ?? 0}`;
          return `info depth ${line.depth} multipv ${index + 1} score ${score} pv ${line.pv.join(" ")}`;
        }),
        `bestmove ${lines[0].uci}`,
      ];
    }
    return undefined;
  });
}

function fenKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}
