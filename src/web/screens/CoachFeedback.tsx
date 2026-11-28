import { Volume2, VolumeX } from "lucide-react";
import type { CoachMessage } from "../coach/coachState.js";
import { t } from "../i18n/t.js";
import { GradeChip } from "./GradeChip.js";
import { Pip } from "./Pip.js";

export function CoachFeedback({
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
  const isThinking = message.pip === "thinking";
  return (
    <div
      className={`pp-feedback${message.grade ? ` pp-feedback--${message.grade}` : ""}`}
      data-mode={message.mode}
    >
      <Pip mood={message.pip} className="pp-feedback__pip" />
      <div className="pp-feedback__body">
        <div className="pp-feedback__label">
          {message.grade && <GradeChip grade={message.grade} />}
          {speech && (
            <button
              type="button"
              className="pp-iconbtn pp-feedback__voice"
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
        </div>
        <p
          className="pp-feedback__text"
          data-testid="coach-text"
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
      </div>
      {message.mode === "nudge" && retryActions ? (
        <div className="pp-feedback__actions">
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={retryActions.keepMove}
          >
            {t("coach.keepMove")}
          </button>
          <button
            className="pp-btn pp-btn--secondary"
            type="button"
            onClick={retryActions.showMe}
          >
            {t("coach.showMe")}
          </button>
          <button
            className="pp-btn pp-btn--primary"
            type="button"
            onClick={retryActions.tryAgain}
          >
            {t("coach.tryAgain")}
          </button>
        </div>
      ) : (
        !isHint &&
        message.mode !== "praise" &&
        onDismiss && (
          <div className="pp-feedback__actions">
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
  );
}
