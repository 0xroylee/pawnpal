import { useEffect, useState } from "react";
import type { Color } from "chess.js";
import type { RephraseMode, RephraseResult } from "../../shared/coach/types.js";
import type { CoachMessage } from "../coach/coachState.js";
import { t } from "../i18n/t.js";
import { coachApi, type BrainStatus } from "../parent/client.js";

const modes: Record<CoachMessage["mode"], RephraseMode> = {
  nudge: "nudge",
  explain: "explain",
  reveal: "reveal",
  praise: "praise",
  hint1: "hint",
  hint2: "hint",
  hint3: "hint",
};

export function useRephrasedMessage(
  message: CoachMessage | undefined,
  kidColor: Color,
  kidAge: number | null | undefined,
  brain?: BrainStatus,
) {
  const [resolved, setResolved] = useState<{
    message: CoachMessage;
    answer: RephraseResult;
  }>();
  const enabled = Boolean(brain?.enabled && !brain.paused);
  const timeoutMs = brain?.timeoutMs ?? 3000;
  useEffect(() => {
    if (!enabled || !message?.fact) return;
    const controller = new AbortController();
    const fallback = (reason: "timeout" | "network") =>
      setResolved({
        message,
        answer: { text: message.text, source: "template", reason },
      });
    const timer = setTimeout(() => {
      controller.abort();
      fallback("timeout");
    }, timeoutMs);
    void coachApi
      .phrase(
        {
          fact: message.fact,
          mode: modes[message.mode],
          templateText: message.text,
          kidColor,
          ...(kidAge == null ? {} : { kidAge }),
          language: "en",
        },
        controller.signal,
      )
      .then((answer) => {
        if (!controller.signal.aborted) setResolved({ message, answer });
      })
      .catch(() => {
        if (!controller.signal.aborted) fallback("network");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, kidAge, kidColor, message, timeoutMs]);
  if (!message || !enabled || !message.fact) return message;
  if (resolved?.message === message) return { ...message, ...resolved.answer };
  return { ...message, text: t("coach.thinking"), pip: "thinking" as const };
}
