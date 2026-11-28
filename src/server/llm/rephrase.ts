import {
  buildRephraseRequest,
  type ChatCompletionRequest,
} from "../../shared/coach/promptBuilder.ts";
import {
  stripThinking,
  validateRephrase,
} from "../../shared/coach/validateRephrase.ts";
import { shouldCallLlm } from "../../shared/coach/rephrasePolicy.ts";
import type {
  RephraseReason,
  RephraseRequestInput,
  RephraseResult,
} from "../../shared/coach/types.ts";
import { LlmError } from "./client.ts";

type RephraseClient = {
  chat(request: ChatCompletionRequest): Promise<{ text: string; raw: unknown }>;
};

export async function rephrase(options: {
  client: RephraseClient;
  model: string;
  input: RephraseRequestInput;
  log?: (reason: RephraseReason) => void;
}): Promise<RephraseResult> {
  const fallback = (reason: RephraseReason): RephraseResult => {
    try {
      options.log?.(reason);
    } catch {
      // A diagnostic callback must not prevent the built-in message fallback.
    }
    return { text: options.input.templateText, source: "template", reason };
  };

  if (!shouldCallLlm(options.input)) {
    return fallback("reveals-better-move");
  }

  try {
    const request = buildRephraseRequest(options.input, {
      model: options.model,
    });
    const response = await options.client.chat(request);
    const candidate = stripThinking(response.text);
    const result = validateRephrase(candidate, {
      fact: options.input.fact,
      mode: options.input.mode,
      kidColor: options.input.kidColor,
    });
    if (!result.ok) return fallback(result.reason);
    return { text: result.text, source: "llm" };
  } catch (error) {
    return fallback(error instanceof LlmError ? error.code : "network");
  }
}
