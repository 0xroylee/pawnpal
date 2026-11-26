import { fileURLToPath } from "node:url";
import { validateRephrase } from "../../src/shared/coach/validateRephrase.ts";
import { readJsonl } from "../lib/jsonl.ts";
import type { GoldExample } from "../lib/teacher.ts";
import { checkWording } from "../lib/wordingRules.ts";

const examplesPath = fileURLToPath(
  new URL("./examples.jsonl", import.meta.url),
);
const evalPath = fileURLToPath(new URL("./eval.jsonl", import.meta.url));

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

describe("reviewed gold placeholders", () => {
  it("keeps examples and evaluation rows small, marked, and valid", async () => {
    const examples = await collect(readJsonl<GoldExample>(examplesPath));
    const evaluation = await collect(readJsonl<GoldExample>(evalPath));

    expect(examples).toHaveLength(6);
    expect(evaluation).toHaveLength(10);
    for (const item of [...examples, ...evaluation]) {
      expect(typeof item.reviewed).toBe("boolean");
      expect(item.reviewed).toBe(false);
      expect(checkWording(item.text)).toEqual({ ok: true });
      expect(
        validateRephrase(item.text, {
          fact: item.fact,
          mode: item.mode,
          kidColor: item.kidColor,
        }),
      ).toEqual({ ok: true, text: item.text });
    }
  });
});
