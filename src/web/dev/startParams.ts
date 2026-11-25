import { validateFen } from "chess.js";
import { isDifficulty, type Difficulty } from "../../shared/game/difficulty.js";

export function parseStartParams(
  search: string,
  dev: boolean,
): {
  fen: string;
  color: "w" | "b";
  analyst?: "replay";
  offerTryAgain?: false;
  level?: Difficulty;
} | null {
  if (!dev) return null;
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const fen = params.get("fen");
  if (!fen || !validateFen(fen).ok) return null;
  const requestedColor = params.get("color");
  if (requestedColor && requestedColor !== "w" && requestedColor !== "b")
    return null;
  const requestedAnalyst = params.get("analyst");
  if (params.has("analyst") && requestedAnalyst !== "replay") return null;
  const level = Number(params.get("level"));
  if (params.has("level") && !isDifficulty(level)) return null;
  const activeColor = fen.trim().split(/\s+/)[1];
  const color = requestedColor ?? activeColor;
  return color === "w" || color === "b"
    ? {
        fen,
        color,
        ...(requestedAnalyst === "replay" ? { analyst: "replay" } : {}),
        ...(params.get("tryAgain") === "off" ? { offerTryAgain: false } : {}),
        ...(isDifficulty(level) ? { level } : {}),
      }
    : null;
}
