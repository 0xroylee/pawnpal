import { describe, expect, it } from "vitest";
import { finalizeFact, type CoachFact, type RephraseMode } from "./types.ts";
import { buildRephraseRequest } from "./promptBuilder.ts";

const fact = finalizeFact({
  kind: "missed-capture",
  subject: { type: "n", color: "w", square: "f3" },
  betterMover: { type: "n", color: "w", square: "f3" },
  targets: [{ type: "r", color: "b", square: "e5" }],
  betterMoveSan: "Nxe5",
  betterMoveUci: "f3e5",
});

const modeRules: Record<RephraseMode, string> = {
  nudge: "Do not reveal the better move.",
  explain: "Say what happens next in plain words.",
  reveal: "You may name the better move exactly as it appears in the facts.",
  praise: "Keep it to one cheerful sentence.",
  hint: "Do not reveal the move; point the child at the piece.",
};

function build(mode: RephraseMode, kidAge?: number) {
  return buildRephraseRequest(
    {
      fact,
      mode,
      templateText: "Can you find a safe square?",
      kidColor: "w",
      ...(kidAge === undefined ? {} : { kidAge }),
      language: "en",
    },
    { model: "local-model" },
  );
}

describe("buildRephraseRequest", () => {
  it.each(Object.entries(modeRules) as [RephraseMode, string][])(
    "uses the %s mode rule",
    (mode, rule) => {
      expect(build(mode).messages[0]).toEqual({
        role: "system",
        content: `You are Pip, a friendly chess coach talking to a child aged about 8. Rewrite the coach note for the child in at most two short sentences. Use only the facts given. Never mention a move, square or piece that isn't in the facts. No numbers, no evaluations, no notation unless it's listed in the facts. ${rule}`,
      });
    },
  );

  it("uses the supplied age and omits other profile fields", () => {
    const request = build("explain", 11);
    const serialized = JSON.stringify(request);
    expect(request.messages[0]?.content).toContain("child aged 11.");
    expect(serialized).not.toContain("name");
    expect(serialized).not.toContain("Ada");
    expect(
      Object.keys(
        JSON.parse(
          request.messages[1]!.content.split("\nReference note: ")[0]!,
        ),
      ),
    ).toEqual([
      "schemaVersion",
      "pieces",
      "moves",
      "squares",
      "betterMove",
      "kind",
    ]);
  });

  it("serializes the schema and fact using stable names and order", () => {
    const request = build("reveal");
    const userContent = request.messages[1]!.content;
    const [factJson, referenceNote] = userContent.split("\nReference note: ");
    expect(JSON.parse(factJson!)).toEqual({
      schemaVersion: 1,
      pieces: [
        { owner: "yours", piece: "knight", square: "f3" },
        { owner: "theirs", piece: "rook", square: "e5" },
      ],
      moves: ["Nxe5"],
      squares: ["f3", "e5"],
      betterMove: "Nxe5",
      kind: "missed-capture",
    });
    expect(referenceNote).toBe("Can you find a safe square?");
  });

  it("preserves top-level request key insertion order and values", () => {
    const request = build("nudge");
    expect(Object.keys(request)).toEqual([
      "model",
      "messages",
      "temperature",
      "max_tokens",
      "stream",
    ]);
    expect(request).toMatchObject({
      model: "local-model",
      temperature: 0.6,
      max_tokens: 120,
      stream: false,
    });
  });

  it("produces byte-identical JSON for identical inputs", () => {
    expect(JSON.stringify(build("praise", 9))).toBe(
      JSON.stringify(build("praise", 9)),
    );
  });

  it.each(["w", "b"] as const)(
    "uses the kid's color when the better mover is the opponent's piece (%s kid)",
    (kidColor) => {
      const opponentColor = kidColor === "w" ? "b" : "w";
      const roleFact = finalizeFact({
        kind: "missed-capture",
        subject: { type: "n", color: kidColor, square: "f3" },
        betterMover: { type: "r", color: opponentColor, square: "e5" },
      });

      expect(promptPieces(roleFact, kidColor)).toEqual([
        { owner: "yours", piece: "knight", square: "f3" },
        { owner: "theirs", piece: "rook", square: "e5" },
      ]);
    },
  );

  it.each(["w", "b"] as const)(
    "uses the kid's color when the subject is the opponent's piece (%s kid)",
    (kidColor) => {
      const opponentColor = kidColor === "w" ? "b" : "w";
      const roleFact = finalizeFact({
        kind: "threat",
        subject: { type: "n", color: opponentColor, square: "f3" },
        targets: [{ type: "k", color: kidColor, square: "e8" }],
      });

      expect(promptPieces(roleFact, kidColor)).toEqual([
        { owner: "theirs", piece: "knight", square: "f3" },
        { owner: "yours", piece: "king", square: "e8" },
      ]);
    },
  );

  it.each(["w", "b"] as const)(
    "does not infer ownership from the threat fact's first attacker (%s kid)",
    (kidColor) => {
      const opponentColor = kidColor === "w" ? "b" : "w";
      const threatFact = finalizeFact({
        kind: "threat",
        attacker: { type: "r", color: opponentColor, square: "b8" },
        targets: [{ type: "k", color: kidColor, square: "e8" }],
      });

      expect(promptPieces(threatFact, kidColor)).toEqual([
        { owner: "theirs", piece: "rook", square: "b8" },
        { owner: "yours", piece: "king", square: "e8" },
      ]);
    },
  );
});

function promptPieces(fact: CoachFact, kidColor: "w" | "b") {
  const request = buildRephraseRequest(
    {
      fact,
      mode: "explain",
      templateText: "Look closely.",
      kidColor,
      language: "en",
    },
    { model: "local-model" },
  );
  const factJson = request.messages[1]!.content.split("\nReference note: ")[0]!;
  return JSON.parse(factJson).pieces;
}
