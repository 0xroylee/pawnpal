export type ParsedUciLine =
  | { type: "uciok" }
  | { type: "readyok" }
  | { type: "bestmove"; move: string | null; ponder?: string }
  | {
      type: "info";
      depth: number;
      multipv: number;
      score: { cp: number } | { mate: number };
      pv: string[];
    };

export function parseUciLine(line: string): ParsedUciLine | null {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === "uciok") return { type: "uciok" };
  if (parts[0] === "readyok") return { type: "readyok" };
  if (parts[0] === "bestmove") {
    const move = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
    const ponderIndex = parts.indexOf("ponder");
    return {
      type: "bestmove",
      move,
      ...(ponderIndex >= 0 && parts[ponderIndex + 1]
        ? { ponder: parts[ponderIndex + 1] }
        : {}),
    };
  }
  if (parts[0] !== "info") return null;

  const depthIndex = parts.indexOf("depth");
  const scoreIndex = parts.indexOf("score");
  const pvIndex = parts.indexOf("pv");
  if (depthIndex < 0 || scoreIndex < 0 || pvIndex < 0) return null;
  const depth = Number(parts[depthIndex + 1]);
  const multipvIndex = parts.indexOf("multipv");
  const multipv = multipvIndex < 0 ? 1 : Number(parts[multipvIndex + 1]);
  const scoreType = parts[scoreIndex + 1];
  const scoreValue = Number(parts[scoreIndex + 2]);
  const pv = parts.slice(pvIndex + 1);
  if (
    !Number.isFinite(depth) ||
    !Number.isFinite(multipv) ||
    !Number.isFinite(scoreValue) ||
    pv.length === 0
  ) {
    return null;
  }
  if (scoreType !== "cp" && scoreType !== "mate") return null;
  return {
    type: "info",
    depth,
    multipv,
    score: scoreType === "cp" ? { cp: scoreValue } : { mate: scoreValue },
    pv,
  };
}
