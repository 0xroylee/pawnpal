import { createHash } from "node:crypto";

export type SplitRatios = [number, number, number];
export type GameRecord = { gameId: string };

export function splitByGame<T extends GameRecord>(
  records: T[],
  options: { seed: string | number; ratios: SplitRatios },
): { train: T[]; validation: T[]; test: T[] } {
  const [trainRatio, validationRatio, testRatio] = options.ratios;
  if (
    options.ratios.some((ratio) => !Number.isFinite(ratio) || ratio < 0) ||
    Math.abs(trainRatio + validationRatio + testRatio - 1) > 1e-9
  ) {
    throw new Error("Split ratios must be non-negative and sum to 1");
  }

  const splitById = new Map<string, "train" | "validation" | "test">();
  const result = { train: [] as T[], validation: [] as T[], test: [] as T[] };

  for (const record of records) {
    let split = splitById.get(record.gameId);
    if (!split) {
      const digest = createHash("sha256")
        .update(`${record.gameId}${options.seed}`)
        .digest();
      const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
      split =
        bucket < trainRatio
          ? "train"
          : bucket < trainRatio + validationRatio
            ? "validation"
            : "test";
      splitById.set(record.gameId, split);
    }
    result[split].push(record);
  }

  return result;
}
