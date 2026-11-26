import {
  stripThinking,
  validateRephrase,
} from "../../src/shared/coach/validateRephrase.ts";
import type { RephraseReason } from "../../src/shared/coach/types.ts";
import type { PromptRecord } from "./prompts.ts";
import { checkWording, type WordingReason } from "./wordingRules.ts";

export type FilterDropReason = RephraseReason | WordingReason | "duplicate";

export type FilterResult = {
  kept: string[];
  dropped: { text: string; reason: FilterDropReason }[];
};

export function filterCandidates(
  prompt: PromptRecord,
  candidates: string[],
): FilterResult {
  const kept: string[] = [];
  const keptNgrams: Set<string>[] = [];
  const dropped: FilterResult["dropped"] = [];

  for (const candidate of candidates) {
    const text = stripThinking(candidate);
    const validation = validateRephrase(text, {
      fact: prompt.fact,
      mode: prompt.mode,
      kidColor: prompt.kidColor,
    });
    if (!validation.ok) {
      dropped.push({ text, reason: validation.reason });
      continue;
    }

    const wording = checkWording(text);
    if (!wording.ok) {
      dropped.push({ text, reason: wording.reason });
      continue;
    }

    const ngrams = wordTrigrams(text);
    if (keptNgrams.some((existing) => jaccard(existing, ngrams) >= 0.8)) {
      dropped.push({ text, reason: "duplicate" });
      continue;
    }

    if (kept.length < 2) {
      kept.push(text);
      keptNgrams.push(ngrams);
    }
  }

  return { kept, dropped };
}

function wordTrigrams(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  const words = normalized === "" ? [] : normalized.split(" ");
  const trigrams = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) {
    trigrams.add(words.slice(index, index + 3).join(" "));
  }
  return trigrams;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
