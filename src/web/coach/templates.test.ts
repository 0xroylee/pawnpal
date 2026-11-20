import { describe, expect, it } from "vitest";
import { finalizeFact, type FactKind } from "../../shared/coach/types.js";
import {
  createVariantPicker,
  factParams,
  messageKeys,
  renderMessage,
} from "./templates.js";

const kinds: FactKind[] = [
  "allowed-mate",
  "missed-mate",
  "hanging-piece",
  "allowed-fork",
  "missed-capture",
  "missed-fork",
  "threat",
  "played-fork",
];

describe("coach templates", () => {
  it("lists available variants for every fact and hint mode", () => {
    for (const kind of kinds) {
      for (const mode of [
        "nudge",
        "explain",
        "reveal",
        "praise",
        "late",
      ] as const) {
        expect(messageKeys(kind, mode).length).toBeGreaterThanOrEqual(2);
      }
      expect(messageKeys(kind, "hint2").length).toBeGreaterThanOrEqual(2);
    }
    expect(messageKeys("noFact", "explain").length).toBeGreaterThanOrEqual(2);
    expect(messageKeys("noFact", "late").length).toBeGreaterThanOrEqual(2);
    expect(messageKeys("noFact", "praise").length).toBeGreaterThanOrEqual(2);
    expect(messageKeys("noFact", "reveal").length).toBeGreaterThanOrEqual(2);
    expect(messageKeys("noFact", "hint1").length).toBeGreaterThanOrEqual(2);
    expect(messageKeys("noFact", "hint3").length).toBeGreaterThanOrEqual(2);
  });

  it("renders piece words from the role fields", () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "n", color: "w", square: "f3" },
      attacker: { type: "r", color: "b", square: "f8" },
      threatMoveSan: "Rxf3",
      threatMoveUci: "f8f3",
    });

    expect(factParams(fact, "w")).toEqual({
      piece: "knight",
      attacker: "rook",
      betterPiece: "knight",
    });
    const message = renderMessage({
      kind: fact.kind,
      mode: "explain",
      fact,
      picker: createVariantPicker(() => 0),
      kidColor: "w",
    });
    expect(message.text).toContain("knight");
    expect(message.text).toContain("rook");
    expect(message.text).not.toMatch(/[a-h][1-8]\b/i);
    expect(message.text).not.toMatch(/\{[^}]+\}/);
  });

  it("rotates variants without repeating the same group consecutively", () => {
    const picker = createVariantPicker(() => 0);
    const keys = messageKeys("threat", "nudge");
    const otherKeys = messageKeys("missed-mate", "nudge");
    const first = picker.pick(keys);

    expect(picker.pick(keys)).not.toBe(first);
    expect(picker.pick(keys)).toBe(first);
    expect(picker.pick(otherKeys)).toBe(otherKeys[0]);
  });
});
