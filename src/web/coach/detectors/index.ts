import type { CoachFact, FactKind } from "../../../shared/coach/types.ts";
import { allowedFork } from "./allowedFork.js";
import { allowedMate } from "./allowedMate.js";
import { type Detector, type DetectorContext } from "./context.js";
import { hangingPiece } from "./hangingPiece.js";
import { missedCapture } from "./missedCapture.js";
import { missedFork } from "./missedFork.js";
import { missedMate } from "./missedMate.js";
import { playedFork } from "./playedFork.js";
import { FACT_PRIORITY } from "./priority.js";
import { threat } from "./threat.js";

export const allDetectors: Detector[] = [
  allowedMate,
  missedMate,
  hangingPiece,
  allowedFork,
  missedCapture,
  missedFork,
  threat,
  playedFork,
];

export function runDetectors(
  context: DetectorContext,
  detectors: Detector[] = allDetectors,
): CoachFact[] {
  const facts = detectors.flatMap((detector) => detector(context));
  const higherPriorityKinds = new Set<FactKind>(FACT_PRIORITY.slice(0, -1));
  return facts.some((fact) => higherPriorityKinds.has(fact.kind))
    ? facts.filter((fact) => fact.kind !== "threat")
    : facts;
}

export type { Detector, DetectorContext };
export {
  buildContext,
  type BuildContextInput,
  type HintAnalysis,
} from "./context.js";
