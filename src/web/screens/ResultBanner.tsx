import type { GameResult } from "../game/reducer.js";
import { t } from "../i18n/t.js";
import { resultMessageKey } from "./resultMessage.js";
import type { Badge } from "../../shared/game/rewards.js";
import { Pip } from "./Pip.js";
import { RewardStars } from "./Rewards.js";

export function ResultBanner({
  result,
  onPlayAgain,
  onReview,
  onSkip,
  stars,
  badges,
}: {
  result: GameResult;
  onPlayAgain: () => void;
  onReview?: () => void;
  onSkip?: () => void;
  stars?: number | null;
  badges?: Badge[];
}) {
  return (
    <section className="pp-result pp-card">
      <h2>{t(resultMessageKey(result))}</h2>
      <Pip
        mood={
          badges?.length || result.winner === "kid"
            ? "cheering"
            : result.winner === "opponent"
              ? "encouraging"
              : "happy"
        }
      />
      {stars != null && <RewardStars count={stars} />}
      {badges?.length ? (
        <ul className="pp-rewards__new" aria-live="polite">
          {badges.map(({ id }) => (
            <li key={id}>
              {t("rewards.newBadge", { badge: t(`rewards.badge.${id}`) })}
            </li>
          ))}
        </ul>
      ) : null}
      {onReview && (
        <button
          className="pp-btn pp-btn--primary pp-btn--block"
          type="button"
          onClick={onReview}
        >
          {t("review.open")}
        </button>
      )}
      <button
        className={`pp-btn pp-btn--${onReview ? "secondary" : "primary"} pp-btn--block`}
        type="button"
        onClick={onPlayAgain}
      >
        {t("game.playAgain")}
      </button>
      {onSkip && (
        <button
          className="pp-btn pp-btn--ghost pp-btn--block"
          type="button"
          onClick={onSkip}
        >
          {t("review.skip")}
        </button>
      )}
    </section>
  );
}
