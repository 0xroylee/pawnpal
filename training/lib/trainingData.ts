import { join } from "node:path";
import type { ChatCompletionMessage } from "../../src/shared/coach/promptBuilder.ts";
import type { RephraseMode } from "../../src/shared/coach/types.ts";
import { writeJsonl } from "./jsonl.ts";
import { splitByGame, type SplitRatios } from "./split.ts";
import type { PromptRecord } from "./prompts.ts";

export type FilteredTrainingPair = {
  id: string;
  gameId: string;
  mode: RephraseMode;
  kidAge: number;
  messages: PromptRecord["request"]["messages"];
  text: string;
};

export type MlxMessage =
  | ChatCompletionMessage
  | {
      role: "assistant";
      content: string;
    };

export type MlxExample = { messages: MlxMessage[] };
export type TrainingMetadata = Pick<
  FilteredTrainingPair,
  "id" | "gameId" | "mode" | "kidAge"
>;
export type MlxSplit = {
  data: MlxExample[];
  metadata: TrainingMetadata[];
};
export type MlxSplits = {
  train: MlxSplit;
  valid: MlxSplit;
  test: MlxSplit;
};

export function makeTrainingPair(
  prompt: Pick<PromptRecord, "id" | "gameId" | "mode" | "kidAge" | "request">,
  text: string,
): FilteredTrainingPair {
  return {
    id: prompt.id,
    gameId: prompt.gameId,
    mode: prompt.mode,
    kidAge: prompt.kidAge,
    messages: prompt.request.messages,
    text,
  };
}

export async function writeMlxSplits(
  directory: string,
  records: FilteredTrainingPair[],
  options: { seed: string | number; ratios: SplitRatios },
): Promise<MlxSplits> {
  const split = splitByGame(records, options);
  const result: MlxSplits = {
    train: makeMlxSplit(split.train),
    valid: makeMlxSplit(split.validation),
    test: makeMlxSplit(split.test),
  };

  await Promise.all(
    (Object.keys(result) as (keyof MlxSplits)[]).flatMap((name) => [
      writeJsonl(join(directory, `${name}.jsonl`), result[name].data),
      writeJsonl(join(directory, `${name}.meta.jsonl`), result[name].metadata),
    ]),
  );
  return result;
}

function makeMlxSplit(records: FilteredTrainingPair[]): MlxSplit {
  return {
    data: records.map((record) => ({
      messages: [
        ...record.messages,
        { role: "assistant", content: record.text },
      ],
    })),
    metadata: records.map(({ id, gameId, mode, kidAge }) => ({
      id,
      gameId,
      mode,
      kidAge,
    })),
  };
}
