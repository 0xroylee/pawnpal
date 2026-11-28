import type { RephraseRequestInput } from "./types.ts";

export function shouldCallLlm(input: RephraseRequestInput): boolean {
  return !(
    (input.mode === "nudge" || input.mode === "hint") &&
    isCastlingBetterMove(input.fact)
  );
}

function isCastlingBetterMove(fact: RephraseRequestInput["fact"]): boolean {
  if (fact.betterMoveSan && /^O-O(?:-O)?[+#]?$/.test(fact.betterMoveSan)) {
    return true;
  }

  return (
    ["e1g1", "e1c1", "e8g8", "e8c8"].includes(fact.betterMoveUci ?? "") &&
    (fact.betterMover === undefined || fact.betterMover.type === "k")
  );
}
