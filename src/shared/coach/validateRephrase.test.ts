import { describe, expect, it } from "vitest";
import { finalizeFact, type RephraseMode } from "./types.ts";
import { stripThinking, validateRephrase } from "./validateRephrase.ts";

const fact = finalizeFact({
  kind: "threat",
  subject: { type: "n", color: "w", square: "f3" },
  attacker: { type: "r", color: "b", square: "b8" },
  betterMover: { type: "n", color: "w", square: "f3" },
  targets: [{ type: "k", color: "b", square: "e8" }],
  betterMoveSan: "Nxe5",
  betterMoveUci: "f3e5",
  threatMoveSan: "Rxf3+",
  threatMoveUci: "b8f3",
});

const passingCases: { name: string; text: string; mode?: RephraseMode }[] = [
  { name: "plain encouragement", text: "Keep thinking." },
  { name: "known knight", text: "Your knight can move safely." },
  { name: "known rook", text: "The rook watches the file." },
  { name: "known king", text: "That king is in check." },
  { name: "known square", text: "Look at f3." },
  {
    name: "two sentence question",
    text: "What might happen next? Can you spot it?",
  },
  { name: "known move in explain mode", text: "Try Nxe5 in explain mode." },
  { name: "one cheerful sentence", text: "Nice work!" },
  { name: "short sentence", text: "Maybe wait." },
  { name: "safe piece reference", text: "Your knight is ready." },
  { name: "no profile details", text: "Can you find a plan?" },
  {
    name: "two sentences with ordinary words",
    text: "Look closely. Think carefully.",
  },
  { name: "punctuation within a move", text: "The rook can play Rxf3+." },
  {
    name: "219 characters and two sentences",
    text: `Good job. ${"a".repeat(208)}!`,
  },
  {
    name: "nudge without a move",
    text: "Can you protect your knight?",
    mode: "nudge",
  },
];

const rejectingCases: {
  name: string;
  text: string;
  mode?: RephraseMode;
  reason: string;
}[] = [
  { name: "empty", text: "", reason: "empty" },
  { name: "whitespace only", text: "   \n  ", reason: "empty" },
  { name: "sure opening", text: "Sure, I can help.", reason: "meta-opening" },
  {
    name: "AI opening",
    text: "As an AI, I suggest thinking.",
    reason: "meta-opening",
  },
  { name: "https URL", text: "Visit https://example.com now.", reason: "url" },
  {
    name: "bare domain URL",
    text: "Try example.com for ideas.",
    reason: "url",
  },
  {
    name: "FTP URL with a local host",
    text: "Visit ftp://localhost/path.",
    reason: "url",
  },
  {
    name: "HTTP URL with a short host",
    text: "Visit http://x.",
    reason: "url",
  },
  { name: "mailto URL", text: "Send a note to mailto:a@b.", reason: "url" },
  { name: "smile emoji", text: "Nice work 🙂", reason: "emoji" },
  { name: "flag emoji", text: "You can do it 🇺🇸", reason: "emoji" },
  {
    name: "keycap without variation selector",
    text: "Nice work #⃣",
    reason: "emoji",
  },
  { name: "keycap with variation selector", text: "Try 1️⃣", reason: "emoji" },
  { name: "insult", text: "That was stupid.", reason: "unsafe-word" },
  {
    name: "threatening word",
    text: "Destroy the other side.",
    reason: "unsafe-word",
  },
  { name: "221 characters", text: "a".repeat(221), reason: "too-long" },
  { name: "very long", text: "a".repeat(300), reason: "too-long" },
  {
    name: "three periods",
    text: "Look. Think. Play.",
    reason: "too-many-sentences",
  },
  {
    name: "three sentences without spaces",
    text: "One!Two!Three!",
    reason: "too-many-sentences",
  },
  {
    name: "nudge reveals SAN",
    text: "Try Nxe5.",
    mode: "nudge",
    reason: "reveals-better-move",
  },
  {
    name: "hint reveals destination",
    text: "Look at e5.",
    mode: "hint",
    reason: "reveals-better-move",
  },
  { name: "unknown square a1", text: "Look at a1.", reason: "unknown-square" },
  {
    name: "unknown square h1",
    text: "Maybe h1 is useful.",
    reason: "unknown-square",
  },
  {
    name: "unknown SAN check marker",
    text: "Try Rxf3#.",
    reason: "unknown-move",
  },
  {
    name: "unknown SAN without marker",
    text: "Try Rxf3.",
    reason: "unknown-move",
  },
  { name: "remaining digit two", text: "There are 2 ideas.", reason: "digits" },
  { name: "remaining digit three", text: "Try plan 3.", reason: "digits" },
  { name: "Arabic-Indic digit", text: "Try plan ٢.", reason: "digits" },
  { name: "fullwidth digit", text: "Try plan ２.", reason: "digits" },
  {
    name: "unknown queen",
    text: "A queen is waiting.",
    reason: "unknown-piece",
  },
  {
    name: "unknown bishop",
    text: "The bishop can help.",
    reason: "unknown-piece",
  },
  { name: "unknown pawn", text: "Move a pawn.", reason: "unknown-piece" },
];

const lexerRejectingCases: {
  name: string;
  text: string;
  reason: string;
}[] = [
  {
    name: "short castling inside a word",
    text: "Try-O-O.",
    reason: "unknown-move",
  },
  {
    name: "long castling inside a word",
    text: "Try-O-O-O.",
    reason: "unknown-move",
  },
  {
    name: "doubled castling suffix keeps emoji precedence",
    text: "O-O++ 🙂",
    reason: "emoji",
  },
  {
    name: "doubled castling suffix is part of the unknown move",
    text: "O-O++",
    reason: "unknown-move",
  },
  {
    name: "a digit breaks a separated O sequence",
    text: "O 2 O",
    reason: "digits",
  },
  {
    name: "doubled castling suffix keeps disallowed-character precedence",
    text: "O-O++ <",
    reason: "disallowed-character",
  },
  {
    name: "doubled castling suffix keeps URL precedence",
    text: "Try O-O++ at https://example.com",
    reason: "url",
  },
  {
    name: "doubled castling suffix keeps unsafe-word precedence",
    text: "That was stupid. O-O++",
    reason: "unsafe-word",
  },
  {
    name: "doubled castling suffix keeps length precedence",
    text: `O-O++ ${"a".repeat(221)}`,
    reason: "too-long",
  },
  {
    name: "doubled castling suffix keeps sentence-count precedence",
    text: "O-O++. One. Two.",
    reason: "too-many-sentences",
  },
  { name: "superscript digit", text: "Try plan ².", reason: "digits" },
  { name: "subscript digit", text: "Try plan ₂.", reason: "digits" },
  { name: "circled digit", text: "Try plan ②.", reason: "digits" },
  {
    name: "superscript digit sequence",
    text: "Try plan ²³.",
    reason: "digits",
  },
  { name: "circled digit sequence", text: "Try plan ①②.", reason: "digits" },
  { name: "Roman numeral", text: "Try plan Ⅻ.", reason: "digits" },
  { name: "fraction numeral", text: "Try plan ½.", reason: "digits" },
  {
    name: "data URL with a media type",
    text: "Try data:text/plain,hello",
    reason: "url",
  },
  {
    name: "data URL without a media type",
    text: "Try data:,hello",
    reason: "url",
  },
  { name: "javascript URL", text: "Try javascript:alert()", reason: "url" },
  {
    name: "uppercase javascript URL",
    text: "Try JAVASCRIPT:alert()",
    reason: "url",
  },
  { name: "asterisk keycap", text: "Try *⃣", reason: "emoji" },
  {
    name: "family emoji sequence",
    text: "Nice work 👨‍👩‍👧‍👦",
    reason: "emoji",
  },
  { name: "rainbow flag sequence", text: "Nice work 🏳️‍🌈", reason: "emoji" },
  {
    name: "HTML tags",
    text: "Nice <b>move</b>.",
    reason: "disallowed-character",
  },
  {
    name: "markdown emphasis",
    text: "**Nice** move.",
    reason: "disallowed-character",
  },
  {
    name: "parentheses",
    text: "Nice (really) move.",
    reason: "disallowed-character",
  },
  {
    name: "colon label",
    text: "Pip: think again.",
    reason: "disallowed-character",
  },
  {
    name: "slash",
    text: "Nice move / good job.",
    reason: "disallowed-character",
  },
  {
    name: "ampersand",
    text: "Nice move & more.",
    reason: "disallowed-character",
  },
  { name: "underscore", text: "Nice move_ok.", reason: "disallowed-character" },
  { name: "backticks", text: "`code`", reason: "disallowed-character" },
  {
    name: "precomposed non-ASCII letter",
    text: "A café move.",
    reason: "disallowed-character",
  },
  {
    name: "non-ASCII letter in a word",
    text: "Naïve plan.",
    reason: "disallowed-character",
  },
  {
    name: "combining mark",
    text: "Nice e\u0301 move.",
    reason: "disallowed-character",
  },
  {
    name: "zero-width space",
    text: "Nice\u200Bwork.",
    reason: "disallowed-character",
  },
  {
    name: "control character",
    text: "Nice\u0007work.",
    reason: "disallowed-character",
  },
  {
    name: "SAN-shaped prefix with a trailing word",
    text: "Nxe5abc is fine.",
    reason: "digits",
  },
  {
    name: "square prefix with a trailing word",
    text: "Try e5th.",
    reason: "digits",
  },
  {
    name: "piece word inside an apostrophe contraction",
    text: "Your knight's rival is a queen.",
    reason: "unknown-piece",
  },
  {
    name: "piece word inside a hyphenated word",
    text: "Queen-side is open.",
    reason: "unknown-piece",
  },
  {
    name: "emoji takes precedence over unsafe word",
    text: "You idiot 🙂",
    reason: "emoji",
  },
  {
    name: "disallowed character takes precedence over unsafe word",
    text: "Nice <b>stupid</b>",
    reason: "disallowed-character",
  },
  {
    name: "unknown square takes precedence over digits",
    text: "Look at a1 and 2 ideas.",
    reason: "unknown-square",
  },
];

const lexerPassingCases = [
  "You're doing great!",
  "You’re doing great!",
  "o'clock is a word.",
  "Oh-oh, keep looking.",
  "Well-known ideas can help.",
  "Your knight's move is ready.",
  "O what a move.",
  "Oops, keep thinking.",
  "Ooh, nice idea.",
  "That was good.",
  "Look at the board.",
  "The book is open.",
  "The room is ready.",
  "Take your time too.",
  "The zoo is far away.",
  "Think soon.",
  "The moon is bright.",
  "Go on.",
  "Who owns this square?",
  "So often, a plan appears.",
  "To open the position, look again.",
  "O",
  "Well-played, that's a strong knight.",
  "Pip says \"nice\" and 'well done'.",
  "Pip says “nice”; keep going.",
  "Nice work -- keep going.",
  "Nice\u00A0work.",
  "The rook can play Rxf3+.",
  "Look at F3.",
];

const castlingJoiners = ["-", "'", "’"] as const;
const castlingNeighborPunctuation = [
  ".",
  ",",
  "!",
  "?",
  '"',
  "‘",
  "“",
  "”",
  "'",
  "’",
] as const;
const requiredMalformedCastlingExamples = [
  "PlayO-O",
  "O-Oplease",
  "PlayO-Oplease",
  "PlayO-O-Oplease",
  "PlayO'O",
  "PlayO’O",
  "O'Oplease",
  "O’Oplease",
  "co-op",
  "go-on",
  "photo-op",
  "zoo-owner",
  "one-to-one",
  "O - O",
  "O - O - O",
  "O O",
  "OO",
  "OOO",
  "oo",
  "Ooo",
  "O.O",
  "O,O",
  "O;O",
  '"O"-"O"',
  "O--O",
  "O- O",
  "O -O",
  "O-O - O",
  "O-O O",
  '"O-O, O-O-O"',
  "o - O",
  "O - o - O",
  "o o",
  "“O”-“o”",
  "PlayOO",
  "OOplease",
  "BOOK",
  "O-O++",
  "O-O##",
  "O-O+#",
  "O-O#+",
  "O-O-O++",
  "O-O-O##",
  "O-O-O+#",
  "O-O-O#+",
  "PlayO-O+",
  "O-O+O",
  "O-O'O",
  "O-O’O",
  "O-o’o-try",
  "Try-O-O-O-O",
  "try-o-o-o-o",
  "Try’O-o’O-o",
  "try-O-O",
  "Try'O-O'",
  "Try’O-O’",
  "Let's-play-O-O",
] as const;

const castlingListingCases = [
  {
    name: "no castling",
    fact: finalizeFact({ kind: "missed-capture" }),
    betterMoveSan: undefined,
  },
  {
    name: "O-O only",
    fact: finalizeFact({ kind: "missed-capture", betterMoveSan: "O-O" }),
    betterMoveSan: "O-O",
  },
  {
    name: "O-O-O only",
    fact: finalizeFact({ kind: "missed-capture", betterMoveSan: "O-O-O" }),
    betterMoveSan: "O-O-O",
  },
  {
    name: "both castlings",
    fact: finalizeFact({
      kind: "missed-capture",
      betterMoveSan: "O-O",
      threatMoveSan: "O-O-O",
    }),
    betterMoveSan: "O-O",
  },
] as const;

function sequences<T>(items: readonly T[], length: number): T[][] {
  if (length === 0) return [[]];
  return items.flatMap((item) =>
    sequences(items, length - 1).map((rest) => [item, ...rest]),
  );
}

function generatedCastlingRuns(): string[] {
  const runs: string[] = [];
  for (let partCount = 2; partCount <= 5; partCount += 1) {
    const partCases = sequences(["O", "o"] as const, partCount);
    const joinerCases = sequences(castlingJoiners, partCount - 1);
    for (const parts of partCases) {
      for (const joiners of joinerCases) {
        runs.push(
          parts
            .map(
              (part, index) =>
                `${index === 0 ? "" : joiners[index - 1]}${part}`,
            )
            .join(""),
        );
      }
    }
  }
  return runs;
}

function isExactCastlingRun(run: string): boolean {
  return run === "O-O" || run === "O-O-O";
}

function generatedMalformedCastlingTexts(): string[] {
  const texts = new Set<string>(requiredMalformedCastlingExamples);
  for (const run of generatedCastlingRuns()) {
    if (!isExactCastlingRun(run)) {
      texts.add(run);
      for (const punctuation of castlingNeighborPunctuation) {
        texts.add(`${punctuation}${run}`);
        texts.add(`${run}${punctuation}`);
      }
    } else {
      // Apostrophes are excluded from the standalone-token boundary rule.
      for (const punctuation of ["'", "’"] as const) {
        texts.add(`${punctuation}${run}`);
        texts.add(`${run}${punctuation}`);
      }
    }

    for (const prefixJoiner of castlingJoiners) {
      texts.add(`Try${prefixJoiner}${run}`);
      for (const suffixJoiner of castlingJoiners) {
        texts.add(`Try${prefixJoiner}${run}${suffixJoiner}please`);
      }
    }
    for (const suffixJoiner of castlingJoiners) {
      texts.add(`${run}${suffixJoiner}please`);
    }
  }
  return [...texts];
}

const malformedCastlingTexts = generatedMalformedCastlingTexts();

const exactCastlingTokens = [
  { text: "Try O-O.", san: "O-O" },
  { text: "Try O-O-O!", san: "O-O-O" },
  { text: "Try O-O+.", san: "O-O+" },
  { text: "Try O-O#.", san: "O-O#" },
  { text: "Try O-O-O+.", san: "O-O-O+" },
  { text: "Try O-O-O#.", san: "O-O-O#" },
  { text: "“O-O”", san: "O-O" },
] as const;

describe("validateRephrase", () => {
  it.each(passingCases)("accepts $name", ({ text, mode }) => {
    expect(
      validateRephrase(text, {
        fact,
        mode: mode ?? "explain",
        kidColor: "w",
      }),
    ).toEqual({ ok: true, text });
  });

  it.each(rejectingCases)(
    "rejects $name as $reason",
    ({ text, mode, reason }) => {
      expect(
        validateRephrase(text, {
          fact,
          mode: mode ?? "explain",
          kidColor: "w",
        }),
      ).toEqual({
        ok: false,
        reason,
      });
    },
  );

  it.each(lexerRejectingCases)(
    "rejects lexer case $name as $reason",
    ({ text, reason }) => {
      expect(
        validateRephrase(text, { fact, mode: "explain", kidColor: "w" }),
      ).toEqual({ ok: false, reason });
    },
  );

  it.each(lexerPassingCases)(
    "accepts allowed punctuation and text: %s",
    (text) => {
      expect(
        validateRephrase(text, { fact, mode: "explain", kidColor: "w" }),
      ).toEqual({
        ok: true,
        text,
      });
    },
  );

  it(`rejects ${malformedCastlingTexts.length} generated non-standalone castling spellings across all contexts`, () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const text of malformedCastlingTexts) {
      for (const listing of castlingListingCases) {
        for (const mode of ["nudge", "hint", "explain"] as const) {
          for (const kidColor of ["w", "b"] as const) {
            checked += 1;
            const result = validateRephrase(text, {
              fact: listing.fact,
              mode,
              kidColor,
            });
            if (!result.ok && result.reason === "unknown-move") continue;
            mismatches.push(
              `${JSON.stringify(text)} (${listing.name}, ${mode}, ${kidColor}): ${JSON.stringify(result)}`,
            );
          }
        }
      }
    }
    expect(checked).toBe(malformedCastlingTexts.length * 4 * 3 * 2);
    expect(mismatches.slice(0, 20)).toEqual([]);
  }, 30_000);

  it("applies the existing move checks to exact standalone castling tokens", () => {
    const mismatches: string[] = [];
    for (const token of exactCastlingTokens) {
      const baseSan = token.san.replace(/[+#]$/, "");
      for (const listing of castlingListingCases) {
        for (const mode of ["nudge", "hint", "explain"] as const) {
          for (const kidColor of ["w", "b"] as const) {
            const result = validateRephrase(token.text, {
              fact: listing.fact,
              mode,
              kidColor,
            });
            const listed = listing.fact.moves.includes(token.san);
            const isBetterMove = listing.betterMoveSan === baseSan;
            const expected =
              isBetterMove && (mode === "nudge" || mode === "hint")
                ? { ok: false, reason: "reveals-better-move" }
                : listed
                  ? { ok: true, text: token.text }
                  : { ok: false, reason: "unknown-move" };
            if (JSON.stringify(result) !== JSON.stringify(expected)) {
              mismatches.push(
                `${JSON.stringify(token.text)} (${listing.name}, ${mode}, ${kidColor}): ${JSON.stringify(result)} != ${JSON.stringify(expected)}`,
              );
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(["nudge", "hint"] as const)(
    "rejects a SAN-only better-move destination in %s mode",
    (mode) => {
      const sanOnlyFact = finalizeFact({
        kind: "missed-capture",
        subject: { type: "n", color: "w", square: "f3" },
        betterMover: { type: "n", color: "w", square: "f3" },
        targets: [{ type: "r", color: "b", square: "e5" }],
        betterMoveSan: "Nxe5",
      });

      expect(
        validateRephrase("Look at e5.", {
          fact: sanOnlyFact,
          mode,
          kidColor: "w",
        }),
      ).toEqual({ ok: false, reason: "reveals-better-move" });
    },
  );

  it.each([
    {
      san: "Nc3xe4",
      subject: { type: "n", color: "w", square: "c3" },
      text: "Look at e4.",
    },
    {
      san: "exd6 e.p.",
      subject: { type: "p", color: "w", square: "e5" },
      text: "Look at d6.",
    },
  ] as const)(
    "rejects SAN-only destination $text for $san in nudge and hint modes",
    ({ san, subject, text }) => {
      const sanOnlyFact = finalizeFact({
        kind: "missed-capture",
        subject,
        betterMover: subject,
        betterMoveSan: san,
      });

      for (const mode of ["nudge", "hint"] as const) {
        expect(
          validateRephrase(text, { fact: sanOnlyFact, mode, kidColor: "w" }),
        ).toEqual({ ok: false, reason: "reveals-better-move" });
      }
    },
  );

  it.each([
    { san: "Nf3", destination: "f3", type: "n", from: "g1" },
    { san: "Raxd1+", destination: "d1", type: "r", from: "a1" },
    { san: "e8=Q#", destination: "e8", type: "p", from: "e7" },
    { san: "Nbd7", destination: "d7", type: "n", from: "b8" },
    { san: "R1e1", destination: "e1", type: "r", from: "a1" },
    { san: "Nc3xe4", destination: "e4", type: "n", from: "c3" },
    { san: "exd6", destination: "d6", type: "p", from: "e5" },
    { san: "Qh4xe1+", destination: "e1", type: "q", from: "h4" },
    { san: "0-0", destination: "g1", type: "k", from: "e1" },
  ] as const)(
    "derives $destination from SAN-only move $san",
    ({ san, destination, type, from }) => {
      const sanOnlyFact = finalizeFact({
        kind: "missed-capture",
        subject: { type, color: "w", square: from },
        betterMover: { type, color: "w", square: from },
        betterMoveSan: san,
      });

      expect(
        validateRephrase(`Look at ${destination}.`, {
          fact: sanOnlyFact,
          mode: "nudge",
          kidColor: "w",
        }),
      ).toEqual({ ok: false, reason: "reveals-better-move" });
    },
  );

  it.each([
    { kidColor: "w", san: "O-O", destination: "g1", kingSquare: "e1" },
    { kidColor: "w", san: "O-O-O", destination: "c1", kingSquare: "e1" },
    { kidColor: "b", san: "O-O", destination: "g8", kingSquare: "e8" },
    { kidColor: "b", san: "O-O-O", destination: "c8", kingSquare: "e8" },
  ] as const)(
    "uses the king destination for SAN-only castling ($san, $kidColor)",
    ({ kidColor, san, destination, kingSquare }) => {
      const castleFact = finalizeFact({
        kind: "missed-capture",
        subject: { type: "k", color: kidColor, square: kingSquare },
        betterMover: { type: "k", color: kidColor, square: kingSquare },
        betterMoveSan: san,
      });

      expect(
        validateRephrase(`Look at ${destination}.`, {
          fact: castleFact,
          mode: "hint",
          kidColor,
        }),
      ).toEqual({ ok: false, reason: "reveals-better-move" });
    },
  );

  it.each([
    "Nf3",
    "Nbd7",
    "R1e1",
    "Nc3xe4",
    "exd6",
    "e8=Q#",
    "Qh4xe1+",
    "O-O",
    "O-O-O",
    "e4",
  ])("accepts a fact SAN token in explain mode: %s", (san) => {
    const sanFact = finalizeFact({
      kind: "missed-capture",
      betterMoveSan: san,
    });

    expect(
      validateRephrase(`Try ${san}.`, {
        fact: sanFact,
        mode: "explain",
        kidColor: "w",
      }),
    ).toEqual({ ok: true, text: `Try ${san}.` });
  });

  it.each(
    (["O-O", "O-O-O"] as const).flatMap((san) =>
      (["w", "b"] as const).flatMap((kidColor) =>
        (["nudge", "hint"] as const).flatMap((mode) =>
          [
            `You can try-${san}.`,
            `Try'${san}'.`,
            `Try’${san}’.`,
            `Let's-play-${san}.`,
          ].map((text) => ({ san, kidColor, mode, text })),
        ),
      ),
    ),
  )(
    "rejects connected castling $san in $mode for $kidColor: $text",
    ({ san, kidColor, mode, text }) => {
      const kingSquare = kidColor === "w" ? "e1" : "e8";
      const castleFact = finalizeFact({
        kind: "missed-capture",
        subject: { type: "k", color: kidColor, square: kingSquare },
        betterMover: { type: "k", color: kidColor, square: kingSquare },
        betterMoveSan: san,
      });

      expect(
        validateRephrase(text, { fact: castleFact, mode, kidColor }),
      ).toEqual({ ok: false, reason: "unknown-move" });
    },
  );

  it.each(["O-O", "O-O-O"] as const)(
    "rejects connected castling even when listed in fact.moves: %s",
    (san) => {
      const castleFact = {
        ...finalizeFact({ kind: "missed-capture" }),
        moves: [san],
      };

      expect(
        validateRephrase(`Try-${san}.`, {
          fact: castleFact,
          mode: "explain",
          kidColor: "w",
        }),
      ).toEqual({ ok: false, reason: "unknown-move" });
    },
  );

  it.each(["nudge", "hint"] as const)(
    "rejects quiet pawn SAN through disclosure checks in %s mode",
    (mode) => {
      const quietPawnFact = finalizeFact({
        kind: "missed-capture",
        betterMoveSan: "e4",
      });

      expect(
        validateRephrase("Try e4.", {
          fact: quietPawnFact,
          mode,
          kidColor: "w",
        }),
      ).toEqual({ ok: false, reason: "reveals-better-move" });
    },
  );

  it("strips thinking blocks and trims the remaining text", () => {
    expect(
      stripThinking("  Good <think>secret chain of thought</think> job.  "),
    ).toBe("Good  job.");
    expect(
      validateRephrase(
        stripThinking("<think>internal thought</think> Your knight is ready."),
        { fact, mode: "explain", kidColor: "w" },
      ),
    ).toEqual({ ok: true, text: "Your knight is ready." });
  });

  it("maps every BMP scalar and a sampled supplementary set to its lexer reason", () => {
    const numberPattern = /\p{N}/u;
    const extendedPictographicPattern = /\p{Extended_Pictographic}/u;
    const emojiPattern =
      /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\uFE0F|\u20E3|\u200D|[\u{E0020}-\u{E007F}])/u;
    const allowedPunctuation = new Set(Array.from(`.,!?'-;"‘’“”`));
    const allowedLetter = /^[A-Za-z]$/;
    const allowedWhitespace = /^\s$/u;
    const codePoints: number[] = [];

    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      if (codePoint < 0xd800 || codePoint > 0xdfff) codePoints.push(codePoint);
    }

    for (let codePoint = 0x10000; codePoint <= 0x10ffff; codePoint += 1) {
      const character = String.fromCodePoint(codePoint);
      if (
        numberPattern.test(character) ||
        extendedPictographicPattern.test(character)
      ) {
        codePoints.push(codePoint);
      }
    }

    let randomState = 0x6d2b79f5;
    const nextRandom = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState;
    };
    const sampledSupplementary = new Set<number>();
    while (sampledSupplementary.size < 20_000) {
      const codePoint = 0x10000 + (nextRandom() % 0x100000);
      const character = String.fromCodePoint(codePoint);
      if (
        !numberPattern.test(character) &&
        !extendedPictographicPattern.test(character)
      ) {
        sampledSupplementary.add(codePoint);
      }
    }
    codePoints.push(...sampledSupplementary);

    const mismatches: string[] = [];
    for (const codePoint of codePoints) {
      const character = String.fromCodePoint(codePoint);
      const allowed =
        allowedLetter.test(character) ||
        allowedPunctuation.has(character) ||
        allowedWhitespace.test(character);
      const expectedReason = allowed
        ? undefined
        : emojiPattern.test(character)
          ? "emoji"
          : numberPattern.test(character)
            ? "digits"
            : "disallowed-character";
      const result = validateRephrase(`Nice ${character} work.`, {
        fact,
        mode: "explain",
        kidColor: "w",
      });

      if (
        (expectedReason === undefined && !result.ok) ||
        (expectedReason !== undefined &&
          (result.ok || result.reason !== expectedReason))
      ) {
        mismatches.push(`U+${codePoint.toString(16).toUpperCase()}`);
      }
    }

    expect(mismatches.slice(0, 20)).toEqual([]);
  });
});
