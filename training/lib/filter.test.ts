import { fileURLToPath } from "node:url";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { finalizeFact } from "../../src/shared/coach/types.ts";
import { readJsonl } from "./jsonl.ts";
import { filterCandidates } from "./filter.ts";
import type { PromptRecord } from "./prompts.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/candidates.jsonl", import.meta.url),
);

type CandidateFixture = {
  id: string;
  text: string;
  expectedReason?: string;
};

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

function makePrompt(): PromptRecord {
  const fact = finalizeFact({
    kind: "missed-capture",
    subject: { type: "n", color: "w", square: "e2" },
    betterMover: { type: "n", color: "w", square: "e2" },
    targets: [{ type: "r", color: "b", square: "g3" }],
    betterMoveSan: "Nxg3",
    betterMoveUci: "e2g3",
  });
  const input = {
    fact,
    mode: "nudge" as const,
    templateText: "Your knight can find an idea.",
    kidColor: "w" as const,
    language: "en" as const,
  };
  const request = buildRephraseRequest(input, { model: "fixture-model" });
  return {
    id: "fixture-game:4:nudge:8",
    gameId: "fixture-game",
    ply: 4,
    mode: "nudge",
    kidAge: 8,
    kidColor: "w",
    fact,
    templateText: input.templateText,
    request,
    requestJson: JSON.stringify(request),
  };
}

describe("filterCandidates", () => {
  it("drops planted bad candidates with their validator or wording reason", async () => {
    const fixtures = await collect(readJsonl<CandidateFixture>(fixturePath));
    const result = filterCandidates(
      makePrompt(),
      fixtures.map((fixture) => fixture.text),
    );

    for (const fixture of fixtures) {
      if (!fixture.expectedReason) continue;
      expect(result.kept).not.toContain(fixture.text);
      expect(result.dropped).toContainEqual({
        text: fixture.text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
        reason: fixture.expectedReason,
      });
    }
    expect(result.kept).toContain(fixtures[0]?.text);
    expect(result.kept.length).toBeLessThanOrEqual(2);
  });

  it("strips thinking blocks and keeps at most two distinct valid candidates", () => {
    const prompt = makePrompt();
    const result = filterCandidates(prompt, [
      "<think>hidden</think>Your knight can find a quiet idea.",
      "Try a patient plan for this position.",
      "Look for another way to stay comfortable.",
    ]);

    expect(result.kept[0]).toBe("Your knight can find a quiet idea.");
    expect(result.kept).toHaveLength(2);
  });
});
