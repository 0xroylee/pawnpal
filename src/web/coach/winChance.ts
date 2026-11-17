import type { Color } from "chess.js";
import type { EngineLine, EngineScore } from "../../shared/coach/types.ts";

const CP_SCALE = 0.00368208;

export function winChance(score: EngineScore): number {
  if ("mate" in score) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-CP_SCALE * cp)) - 1);
}

export function toKidScore(
  line: EngineLine,
  sideToMove: Color,
  kidColor: Color,
): EngineScore {
  const sign = sideToMove === kidColor ? 1 : -1;
  if (typeof line.mate === "number") return { mate: line.mate * sign };
  return { cp: (line.cp ?? 0) * sign };
}
