import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createLlmClient } from "../../src/server/llm/client.js";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.js";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { finalizeFact } from "../../src/shared/coach/types.ts";
import { readJsonl } from "./jsonl.ts";
import {
  makeTrainingPair,
  writeMlxSplits,
  type FilteredTrainingPair,
} from "./trainingData.ts";

function makePrompt(
  id: string,
  gameId: string,
): Parameters<typeof makeTrainingPair>[0] {
  const fact = finalizeFact({
    kind: "missed-capture",
    betterMoveSan: "Nxe5",
    betterMoveUci: "f3e5",
  });
  const request = buildRephraseRequest(
    {
      fact,
      mode: "explain",
      templateText: "Your knight could capture a rook.",
      kidColor: "w",
      kidAge: 8,
      language: "en",
    },
    { model: "fixture-model" },
  );

  return {
    id,
    gameId,
    mode: "explain",
    kidAge: 8,
    request,
  };
}

async function collect<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of readJsonl<T>(path)) rows.push(row);
  return rows;
}

describe("mlx training data", () => {
  it("preserves inference messages and writes aligned, game-disjoint split files", async () => {
    const prompt = makePrompt("prompt-0", "game-0");
    const mock = mockOpenAi({ replies: [{ text: "A calm idea." }] });
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      fetch: mock.app.request.bind(mock.app),
    });
    await client.chat(prompt.request);
    const serverMessages = JSON.parse(mock.requests[0]!.body).messages;

    const records: FilteredTrainingPair[] = Array.from(
      { length: 60 },
      (_, index) =>
        makeTrainingPair(
          makePrompt(`prompt-${index}`, `game-${index}`),
          `Completion ${index}.`,
        ),
    );
    const root = join(process.cwd(), "training/runs");
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "mlx-data-"));

    try {
      await writeMlxSplits(directory, records, {
        seed: "fixture-seed",
        ratios: [0.9, 0.05, 0.05],
      });
      const dataBySplit = {
        train: await collect<{ messages: unknown[] }>(
          join(directory, "train.jsonl"),
        ),
        valid: await collect<{ messages: unknown[] }>(
          join(directory, "valid.jsonl"),
        ),
        test: await collect<{ messages: unknown[] }>(
          join(directory, "test.jsonl"),
        ),
      };
      const metadataBySplit = {
        train: await collect<{
          id: string;
          gameId: string;
          mode: string;
          kidAge: number;
        }>(join(directory, "train.meta.jsonl")),
        valid: await collect<{
          id: string;
          gameId: string;
          mode: string;
          kidAge: number;
        }>(join(directory, "valid.meta.jsonl")),
        test: await collect<{
          id: string;
          gameId: string;
          mode: string;
          kidAge: number;
        }>(join(directory, "test.meta.jsonl")),
      };

      expect(dataBySplit.train.length).toBeGreaterThan(0);
      expect(dataBySplit.valid.length).toBeGreaterThan(0);
      expect(dataBySplit.test.length).toBeGreaterThan(0);
      expect(dataBySplit.train[0]).toEqual({
        messages: [
          ...serverMessages,
          { role: "assistant", content: expect.stringMatching(/^Completion /) },
        ],
      });
      for (const split of ["train", "valid", "test"] as const) {
        const dataLines = (
          await readFile(join(directory, `${split}.jsonl`), "utf8")
        )
          .trim()
          .split("\n");
        const metaLines = (
          await readFile(join(directory, `${split}.meta.jsonl`), "utf8")
        )
          .trim()
          .split("\n");
        expect(dataBySplit[split]).toHaveLength(metadataBySplit[split].length);
        expect(dataLines).toHaveLength(metaLines.length);
        for (const [index, dataLine] of dataLines.entries()) {
          const row = JSON.parse(dataLine) as {
            messages: { role: string; content: string }[];
          };
          const metadata = metadataBySplit[split][index]!;
          expect(JSON.stringify(row.messages.slice(0, -1))).toBe(
            JSON.stringify(serverMessages),
          );
          expect(Object.keys(JSON.parse(dataLine))).toEqual(["messages"]);
          expect(row.messages.at(-1)).toMatchObject({
            role: "assistant",
            content: `Completion ${metadata.id.slice("prompt-".length)}.`,
          });
          expect(Object.keys(JSON.parse(metaLines[index]!))).toEqual([
            "id",
            "gameId",
            "mode",
            "kidAge",
          ]);
        }
      }
      const gameIds = (rows: typeof metadataBySplit.train) =>
        new Set(rows.map((row) => row.gameId));
      expect(
        [...gameIds(metadataBySplit.train)].some((id) =>
          gameIds(metadataBySplit.valid).has(id),
        ),
      ).toBe(false);
      expect(
        [...gameIds(metadataBySplit.train)].some((id) =>
          gameIds(metadataBySplit.test).has(id),
        ),
      ).toBe(false);
      expect(
        [...gameIds(metadataBySplit.valid)].some((id) =>
          gameIds(metadataBySplit.test).has(id),
        ),
      ).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
