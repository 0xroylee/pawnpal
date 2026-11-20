import { Check, Star } from "lucide-react";
import type { CoachMessage } from "../coach/coachState.js";
import { t, type MessageKey } from "../i18n/t.js";
import { Pip } from "./Pip.js";

const gradeKeys = {
  great: "grade.great",
  good: "grade.good",
  oops: "grade.oops",
  bigoops: "grade.bigoops",
} as const satisfies Record<NonNullable<CoachMessage["grade"]>, MessageKey>;

export function CoachBubble({
  message,
  onDismiss,
}: {
  message?: CoachMessage;
  onDismiss: () => void;
}) {
  if (!message) return null;

  const isHint = message.mode.startsWith("hint");
  const compact = isHint || message.mode === "praise";
  const isThinking = message.pip === "thinking";
  return (
    <div className="pp-coach">
      <Pip mood={message.pip} />
      <div className={`pp-bubble${compact ? " pp-bubble--compact" : ""}`}>
        {message.grade && (
          <div className="pp-bubble__label">
            <span className={`pp-grade pp-grade--${message.grade}`}>
              <span className="pp-grade__icon">
                {message.grade === "great" ? (
                  <Star aria-hidden="true" focusable="false" />
                ) : message.grade === "good" ? (
                  <Check aria-hidden="true" focusable="false" />
                ) : message.grade === "oops" ? (
                  "?"
                ) : (
                  "!!"
                )}
              </span>
              {t(gradeKeys[message.grade])}
            </span>
          </div>
        )}
        <p
          className="pp-bubble__text"
          data-fact-kind={message.kind}
          data-mode={message.mode}
        >
          {isThinking ? (
            <span className="pp-typing" aria-label={t("coach.thinking")}>
              <i />
              <i />
              <i />
            </span>
          ) : (
            message.text
          )}
        </p>
        {!isHint && message.mode !== "praise" && (
          <div className="pp-bubble__actions">
            <button
              className="pp-btn pp-btn--primary"
              type="button"
              onClick={onDismiss}
            >
              {t("coach.ok")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
