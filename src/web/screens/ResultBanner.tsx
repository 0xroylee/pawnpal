import type { GameResult } from "../game/reducer.js";
import { t } from "../i18n/t.js";
import { resultMessageKey } from "./resultMessage.js";

export function ResultBanner({
  result,
  onPlayAgain,
}: {
  result: GameResult;
  onPlayAgain: () => void;
}) {
  return (
    <section className="pp-result pp-card">
      <h2>{t(resultMessageKey(result))}</h2>
      <button
        className="pp-btn pp-btn--primary pp-btn--block"
        type="button"
        onClick={onPlayAgain}
      >
        {t("game.playAgain")}
      </button>
    </section>
  );
}
