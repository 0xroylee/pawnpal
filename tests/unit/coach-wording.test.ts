import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { FactKind } from "../../src/shared/coach/types.ts";
import { finalizeFact } from "../../src/shared/coach/types.ts";
import {
  betterMoverIsThreatenedPiece,
  messageKeys,
  renderMessage,
} from "../../src/web/coach/templates.ts";

const messages = JSON.parse(
  await readFile(
    new URL("../../src/web/i18n/en.json", import.meta.url),
    "utf8",
  ),
) as Record<string, string>;

const factKinds: FactKind[] = [
  "allowed-mate",
  "missed-mate",
  "hanging-piece",
  "allowed-fork",
  "missed-capture",
  "missed-fork",
  "threat",
  "played-fork",
];
const modes = ["nudge", "explain", "reveal", "praise", "late"];
const thirdPersonWords =
  /\b(?:he|she|him|his|her|they|them|their|player|kid|child|student)\b/i;
const blameWords =
  /\b(?:bad|terrible|stupid|dumb|awful|horrible|wrong|worst|silly|lazy|careless)\b/i;

describe("coach wording", () => {
  it("matches allowed-mate wording to the confirmed mate distance", () => {
    const fact = finalizeFact({
      kind: "allowed-mate",
      subject: { type: "k", color: "w", square: "h1" },
      attacker: { type: "r", color: "b", square: "f7" },
      mateIn: 3,
      threatMoveSan: "Rf7+",
      threatMoveUci: "f8f7",
    });

    for (const key of messageKeys(fact.kind, "explain")) {
      const rendered = renderMessage({
        kind: fact.kind,
        mode: "explain",
        fact,
        picker: { pick: () => key },
        kidColor: "w",
      }).text;
      expect(rendered).toContain("three moves");
      expect(rendered).toMatch(/first move/);
      expect(rendered).not.toMatch(/next\b/i);
      expect(rendered).toContain("rook");
    }
  });

  it("describes forks without assuming a king is one of the targets", () => {
    const fact = finalizeFact({
      kind: "missed-fork",
      subject: { type: "n", color: "w", square: "f3" },
      targets: [
        { type: "r", color: "b", square: "e8" },
        { type: "q", color: "b", square: "d5" },
      ],
      betterMoveSan: "Nd4",
      betterMoveUci: "f3d4",
    });

    for (const mode of ["explain", "reveal", "praise"] as const) {
      for (const key of messageKeys(fact.kind, mode)) {
        const rendered = renderMessage({
          kind: fact.kind,
          mode,
          fact,
          picker: { pick: () => key },
          kidColor: "w",
        }).text;
        expect(rendered).not.toMatch(/\bking\b/i);
      }
    }
  });

  it("keeps missed opportunities retrospective on the post-move board", () => {
    for (const kind of [
      "missed-mate",
      "missed-capture",
      "missed-fork",
    ] as const) {
      for (const key of messageKeys(kind, "explain")) {
        const rendered = renderMessage({
          kind,
          mode: "explain",
          kidColor: "w",
          picker: { pick: () => key },
        }).text;
        expect(rendered, key).toMatch(/\b(?:had|could have|would have)\b/i);
      }
    }
  });

  it("keeps every late explanation retrospective", () => {
    for (const kind of [...factKinds, "noFact"] as const) {
      for (const key of messageKeys(kind, "late")) {
        const rendered = renderMessage({
          kind,
          mode: "late",
          kidColor: "w",
          picker: { pick: () => key },
        }).text;
        expect(rendered, key).toMatch(
          /\b(?:had|could have|would have|was|were|left|gave|allowed|led|let|made|created|passed up)\b/i,
        );
        expect(rendered, key).not.toMatch(/\b(?:can|is|are)\b/i);
      }
    }
  });

  it("names the opponent's piece in the hanging-piece reveal", () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "r", color: "w", square: "g3" },
      attacker: { type: "r", color: "b", square: "g8" },
      threatMoveSan: "Rxg3",
      threatMoveUci: "g8g3",
    });
    const key = "coach.hanging-piece.reveal.2" as const;

    expect(
      renderMessage({
        kind: fact.kind,
        mode: "reveal",
        fact,
        picker: { pick: () => key },
        kidColor: "w",
      }).text,
    ).toContain("opponent's rook");
  });

  it("uses escape wording when the better mover is the threatened piece", () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "r", color: "w", square: "g3" },
      attacker: { type: "r", color: "b", square: "g8" },
      betterMover: { type: "r", color: "w", square: "g2" },
      threatMoveUci: "g8g3",
      betterMoveUci: "g2c2",
    });
    const playedMoveUci = "g2g3";
    expect(betterMoverIsThreatenedPiece(fact, playedMoveUci, "w")).toBe(true);

    const keys = messageKeys(fact.kind, "reveal", { escape: true });
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      const rendered = renderMessage({
        kind: fact.kind,
        mode: "reveal",
        fact,
        playedMoveUci,
        picker: { pick: () => key },
        kidColor: "w",
      }).text;
      expect(rendered).toMatch(/safe square|out of danger/i);
      expect(rendered).not.toMatch(/protect your rook/);
    }
  });

  it("labels a distinct same-type better mover as the other piece", () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "r", color: "w", square: "h3" },
      attacker: { type: "r", color: "b", square: "h8" },
      betterMover: { type: "r", color: "w", square: "a2" },
      threatMoveUci: "h8h3",
      betterMoveUci: "a2a3",
    });
    const playedMoveUci = "b2b3";
    expect(betterMoverIsThreatenedPiece(fact, playedMoveUci, "w")).toBe(false);

    for (const key of messageKeys(fact.kind, "reveal")) {
      const rendered = renderMessage({
        kind: fact.kind,
        mode: "reveal",
        fact,
        playedMoveUci,
        picker: { pick: () => key },
        kidColor: "w",
      }).text;
      expect(rendered).toContain("other rook");
    }
  });

  it("keeps coach and hint copy short, kind, and free of board coordinates", () => {
    for (const [key, text] of Object.entries(messages)) {
      if (!key.startsWith("coach.") && !key.startsWith("hint.")) continue;
      expect(text, key).not.toMatch(/[a-h][1-8]\b/i);
      expect(text, key).not.toMatch(/\d/);
      expect(text, key).not.toMatch(thirdPersonWords);
      expect(text, key).not.toMatch(blameWords);
      for (const sentence of text.split(/[.!?]+/).filter(Boolean)) {
        expect(
          sentence.trim().split(/\s+/).length,
          `${key}: ${sentence}`,
        ).toBeLessThanOrEqual(25);
      }
    }
  });

  it("provides two variants for every fact mode and each hint tier", () => {
    for (const kind of factKinds) {
      for (const mode of modes) {
        expect(keysFor(`coach.${kind}.${mode}.`).length).toBeGreaterThanOrEqual(
          2,
        );
      }
      expect(keysFor(`hint.tier2.${kind}.`).length).toBeGreaterThanOrEqual(2);
    }

    expect(keysFor("coach.noFact.explain.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("coach.noFact.nudge.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("coach.noFact.late.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("coach.noFact.praise.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("coach.reveal.generic.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("hint.tier1.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("hint.tier2.generic.").length).toBeGreaterThanOrEqual(2);
    expect(keysFor("hint.tier3.").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps move notation out of every nudge variant", () => {
    for (const kind of [...factKinds, "noFact"] as const) {
      const fact =
        kind === "noFact"
          ? undefined
          : finalizeFact({
              kind,
              subject: { type: "n", color: "w", square: "f3" },
              attacker: { type: "r", color: "b", square: "f8" },
              targets: [{ type: "q", color: "b", square: "e5" }],
              betterMoveSan: "Nxe5",
              betterMoveUci: "f3e5",
              mateIn: 2,
            });
      for (const key of messageKeys(kind, "nudge")) {
        const { text } = renderMessage({
          kind,
          mode: "nudge",
          fact,
          picker: { pick: () => key },
          kidColor: "w",
        });
        expect(text, key).not.toMatch(/[a-h][1-8]|\b[O0]-[O0]/);
      }
    }
  });
});

function keysFor(prefix: string): string[] {
  return Object.keys(messages).filter((key) => key.startsWith(prefix));
}
