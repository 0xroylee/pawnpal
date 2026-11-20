import type { CoachFact, FactKind } from "../../../shared/coach/types.ts";

export const FACT_PRIORITY: readonly FactKind[] = [
  "allowed-mate",
  "missed-mate",
  "hanging-piece",
  "allowed-fork",
  "missed-capture",
  "missed-fork",
  "threat",
];

export function selectFact(facts: CoachFact[]): CoachFact | undefined {
  for (const kind of FACT_PRIORITY) {
    const found = facts.find((fact) => fact.kind === kind);
    if (found) return found;
  }
  return undefined;
}
