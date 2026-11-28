import { Award, Check, Eye, House, Play, Star } from "lucide-react";
import { fixedCount, type Badge } from "../../shared/game/rewards.js";
import { reviewMoments } from "../../shared/game/moments.js";
import type { GameState } from "../game/reducer.js";
import { t } from "../i18n/t.js";
import { Pip } from "./Pip.js";
import { RewardStars } from "./Rewards.js";
import { resultMessageKey } from "./resultMessage.js";

export function ResultScreen({
  state,
  stars,
  badges,
  onReview,
  onPlayAgain,
  onHome,
}: {
  state: GameState;
  stars?: number | null;
  badges?: Badge[];
  onReview?: () => void;
  onPlayAgain: () => void;
  onHome?: () => void;
}) {
  if (!state.result) return null;
  const great = reviewMoments(state).counts.great;
  const fixed = fixedCount(state);
  const moves = state.history.filter(
    (move) => move.color === state.kidColor,
  ).length;
  return (
    <section className="pp-result">
      <div className="pp-card pp-result__card">
        <Pip
          className="pp-result__pip"
          mood={
            badges?.length || state.result.winner === "kid"
              ? "cheering"
              : state.result.winner === "opponent"
                ? "encouraging"
                : "happy"
          }
        />
        <h2>{t(resultMessageKey(state.result))}</h2>
        {stars != null && <RewardStars count={stars} animated />}
        <div className="pp-stats">
          {great > 0 && (
            <div className="pp-stat pp-stat--great">
              <div className="pp-stat__label">{t("result.greatMoves")}</div>
              <div className="pp-stat__value">
                <Star aria-hidden="true" />
                {great}
              </div>
            </div>
          )}
          {fixed > 0 && (
            <div className="pp-stat pp-stat--good">
              <div className="pp-stat__label">{t("result.fixed")}</div>
              <div className="pp-stat__value">
                <Check aria-hidden="true" />
                {fixed}
              </div>
            </div>
          )}
          <div className="pp-stat">
            <div className="pp-stat__label">{t("result.moves")}</div>
            <div className="pp-stat__value">
              <Play aria-hidden="true" />
              {moves}
            </div>
          </div>
        </div>
        {badges?.length ? (
          <ul className="pp-rewards__new" aria-live="polite">
            {badges.map(({ id }) => (
              <li key={id}>
                <span className="pp-badge__medal">
                  <Award aria-hidden="true" />
                </span>
                {t("rewards.newBadge", { badge: t(`rewards.badge.${id}`) })}
              </li>
            ))}
          </ul>
        ) : null}
        {onReview ? (
          <button
            className="pp-btn pp-btn--reward pp-btn--block"
            type="button"
            onClick={onReview}
          >
            <Eye aria-hidden="true" />
            {t("review.open")}
          </button>
        ) : (
          <button
            className="pp-btn pp-btn--primary pp-btn--block"
            type="button"
            onClick={onPlayAgain}
          >
            {t("game.playAgain")}
          </button>
        )}
        {onHome && (
          <div className="pp-result__secondary">
            <button
              className="pp-btn pp-btn--secondary"
              type="button"
              onClick={onPlayAgain}
            >
              {t("game.playAgain")}
            </button>
            <button
              className="pp-btn pp-btn--ghost"
              type="button"
              onClick={onHome}
            >
              <House aria-hidden="true" />
              {t("game.home")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
