import type { GameMove } from "../game/reducer.js";
import { t } from "../i18n/t.js";

export function MoveList({ moves }: { moves: GameMove[] }) {
  return (
    <section className="pp-card pp-moves">
      <h2>{t("game.moves")}</h2>
      {moves.length === 0 ? (
        <p className="pp-moves__empty">{t("game.noMoves")}</p>
      ) : (
        <ol aria-label={t("game.moves")}>
          {moves.map((move, index) => (
            <li data-testid="move" key={`${move.uci}-${index}`}>
              <span className="pp-moves__number">
                {Math.floor(index / 2) + 1}
              </span>
              {move.san}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
