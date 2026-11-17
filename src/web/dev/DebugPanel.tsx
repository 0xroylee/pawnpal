import type { Color } from "chess.js";
import type {
  EngineLine,
  EngineScore,
  Grade,
  MoveAnalysis,
} from "../../shared/coach/types.ts";
import { toKidScore } from "../coach/winChance.js";
import { t, type MessageKey } from "../i18n/t.js";

const gradeLabels: Record<Grade, MessageKey> = {
  best: "debug.gradeBest",
  good: "debug.gradeGood",
  inaccuracy: "debug.gradeInaccuracy",
  mistake: "debug.gradeMistake",
  blunder: "debug.gradeBlunder",
};

export function DebugPanel({
  analyses,
  kidColor,
}: {
  analyses: Record<number, MoveAnalysis>;
  kidColor: Color;
}) {
  const rows = Object.values(analyses).sort(
    (left, right) => left.ply - right.ply,
  );

  return (
    <section className="pp-debug-panel">
      <h2>{t("debug.heading")}</h2>
      <div className="pp-debug-panel__table-wrap">
        <table aria-label={t("debug.heading")}>
          <thead>
            <tr>
              <th scope="col">{t("debug.ply")}</th>
              <th scope="col">{t("debug.move")}</th>
              <th scope="col">{t("debug.evalBefore")}</th>
              <th scope="col">{t("debug.evalAfter")}</th>
              <th scope="col">{t("debug.winBefore")}</th>
              <th scope="col">{t("debug.winAfter")}</th>
              <th scope="col">{t("debug.drop")}</th>
              <th scope="col">{t("debug.gradeHeading")}</th>
              <th scope="col">{t("debug.onlyMove")}</th>
              <th scope="col">{t("debug.late")}</th>
              <th scope="col">{t("debug.depths")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((analysis) => (
              <tr key={analysis.ply} data-ply={analysis.ply}>
                <td>{analysis.ply}</td>
                <td>{analysis.moveSan}</td>
                <td>
                  {formatEval(analysis.linesBefore[0], kidColor, kidColor)}
                </td>
                <td>
                  {formatEval(
                    analysis.linesAfter[0],
                    opposite(kidColor),
                    kidColor,
                  )}
                </td>
                <td>{formatChance(analysis.winBefore)}</td>
                <td>{formatChance(analysis.winAfter)}</td>
                <td>{analysis.drop.toFixed(1)}</td>
                <td data-testid="debug-grade">
                  {t(gradeLabels[analysis.grade])}
                </td>
                <td>{t(analysis.isOnlyMove ? "debug.yes" : "debug.no")}</td>
                <td>{t(analysis.late ? "debug.yes" : "debug.no")}</td>
                <td>
                  {formatDepths(analysis.linesBefore, analysis.linesAfter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatEval(
  line: EngineLine | undefined,
  sideToMove: Color,
  kidColor: Color,
): string {
  if (!line) return "—";
  const score: EngineScore = toKidScore(line, sideToMove, kidColor);
  if ("mate" in score) return `#${score.mate}`;
  return `${score.cp > 0 ? "+" : ""}${score.cp} cp`;
}

function formatChance(chance: number): string {
  return `${chance.toFixed(1)}%`;
}

function formatDepths(
  linesBefore: EngineLine[],
  linesAfter: EngineLine[],
): string {
  const before = reachedDepth(linesBefore);
  const after = reachedDepth(linesAfter);
  return `${before} / ${after}`;
}

function reachedDepth(lines: EngineLine[]): string {
  return lines.length
    ? String(Math.min(...lines.map((line) => line.depth)))
    : "—";
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
