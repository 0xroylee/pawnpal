import { Volume2, VolumeX } from "lucide-react";
import type { CoachMessage } from "../coach/coachState.js";
import { t } from "../i18n/t.js";
import { Pip } from "./Pip.js";

import { GradeChip } from "./GradeChip.js";

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
            <GradeChip grade={message.grade} />
          </div>
        )}
        <p
          className="pp-bubble__text"
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
