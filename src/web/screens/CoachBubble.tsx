import { Check, Star, Volume2, VolumeX } from "lucide-react";
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
  retryActions,
  speech,
}: {
  message?: CoachMessage;
  onDismiss?: () => void;
  speech?: { enabled: boolean; onToggle: () => void };
  retryActions?: {
    tryAgain: () => void;
    showMe: () => void;
    keepMove: () => void;
  };
}) {
  if (!message) return null;

  const isHint = message.mode.startsWith("hint");
  const compact = isHint || message.mode === "praise";
  const isThinking = message.pip === "thinking";
  return (
    <div className="pp-coach">
      <Pip mood={message.pip} />
      <div className={`pp-bubble${compact ? " pp-bubble--compact" : ""}`}>
        {speech && (
          <button
            type="button"
            className="pp-iconbtn pp-bubble__voice"
            onClick={speech.onToggle}
            aria-label={t(
              speech.enabled ? "rewards.voiceMute" : "rewards.voiceOn",
            )}
          >
            {speech.enabled ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
          </button>
        )}
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
          data-source={message.source ?? (isThinking ? undefined : "template")}
          data-reason={message.reason}
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
        {message.mode === "nudge" && retryActions ? (
          <div className="pp-bubble__actions">
            <button
              className="pp-btn pp-btn--primary"
              type="button"
              onClick={retryActions.tryAgain}
            >
              {t("coach.tryAgain")}
            </button>
            <button
              className="pp-btn pp-btn--secondary"
              type="button"
              onClick={retryActions.showMe}
            >
              {t("coach.showMe")}
            </button>
            <button
              className="pp-btn pp-btn--ghost"
              type="button"
              onClick={retryActions.keepMove}
            >
              {t("coach.keepMove")}
            </button>
          </div>
        ) : (
          !isHint &&
          onDismiss &&
          message.mode !== "praise" && (
            <div className="pp-bubble__actions">
              <button
                className="pp-btn pp-btn--primary"
                type="button"
                onClick={onDismiss}
              >
                {t("coach.ok")}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
