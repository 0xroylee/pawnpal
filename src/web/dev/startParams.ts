import { validateFen } from "chess.js";

export function parseStartParams(
  search: string,
  dev: boolean,
): { fen: string; color: "w" | "b"; analyst?: "replay" } | null {
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
  const activeColor = fen.trim().split(/\s+/)[1];
  const color = requestedColor ?? activeColor;
  return color === "w" || color === "b"
    ? {
        fen,
        color,
        ...(requestedAnalyst === "replay" ? { analyst: "replay" } : {}),
      }
    : null;
}
