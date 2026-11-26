export type WordingReason =
  "coordinate" | "digits" | "third-person" | "blame" | "too-many-words";

export type WordingCheck = { ok: true } | { ok: false; reason: WordingReason };

const COORDINATE = /[a-h][1-8]\b/i;
const THIRD_PERSON =
  /\b(?:he|she|him|his|her|they|them|their|player|kid|child|student)\b/i;
const BLAME =
  /\b(?:bad|terrible|stupid|dumb|awful|horrible|wrong|worst|silly|lazy|careless)\b/i;

export function checkWording(text: string): WordingCheck {
  if (COORDINATE.test(text)) return { ok: false, reason: "coordinate" };
  if (/\d/.test(text)) return { ok: false, reason: "digits" };
  if (THIRD_PERSON.test(text)) return { ok: false, reason: "third-person" };
  if (BLAME.test(text)) return { ok: false, reason: "blame" };

  for (const sentence of text.split(/[.!?]+/).filter(Boolean)) {
    if (sentence.trim().split(/\s+/).length > 25) {
      return { ok: false, reason: "too-many-words" };
    }
  }

  return { ok: true };
}
