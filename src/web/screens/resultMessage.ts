import type { GameResult } from "../game/reducer.js";
import type { MessageKey } from "../i18n/t.js";

const drawKeys: Record<
  Exclude<GameResult["reason"], "checkmate" | "resign">,
  MessageKey
> = {
  stalemate: "result.draw.stalemate",
  threefold: "result.draw.threefold",
  "fifty-move": "result.draw.fifty-move",
  insufficient: "result.draw.insufficient",
};

export function resultMessageKey(result: GameResult): MessageKey {
  if (result.winner === "draw") {
    return drawKeys[result.reason as keyof typeof drawKeys];
  }
  if (result.reason === "checkmate") {
    return result.winner === "kid"
      ? "result.win.checkmate"
      : "result.loss.checkmate";
  }
  return result.winner === "kid" ? "result.win.resign" : "result.loss.resign";
}
