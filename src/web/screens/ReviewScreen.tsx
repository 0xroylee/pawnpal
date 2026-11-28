import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  fixedMistake,
  isGreatMove,
  reviewMoments,
  type ReviewMoment,
} from "../../shared/game/moments.js";
import type { GameState } from "../../shared/game/types.js";
import { Board } from "../board/Board.js";
import type { BoardAnnotations } from "../coach/annotations.js";
import type { CoachMessage } from "../coach/coachState.js";
import { selectFact } from "../coach/detectors/priority.js";
import { renderMessage } from "../coach/templates.js";
import { t } from "../i18n/t.js";
import { useRephrasedMessage } from "../game/useRephrasedMessage.js";
import type { BrainStatus } from "../parent/client.js";
import { useReadAloud } from "../sound/readAloud.js";
import { CoachBubble } from "./CoachBubble.js";
import { GradeChip } from "./GradeChip.js";
import { Pip } from "./Pip.js";
import { resultMessageKey } from "./resultMessage.js";
import { RewardStars } from "./Rewards.js";

function reviewNote(moment: ReviewMoment, kidColor: GameState["kidColor"]) {
  const { analysis, kind } = moment;
  const attempt = kind === "fixed" ? fixedMistake(analysis) : undefined;
  const fact =
    kind === "great"
      ? analysis.facts.find(({ kind }) => kind === "played-fork")
      : selectFact(analysis.facts);
  const best = analysis.linesBefore[0];
  const annotations: BoardAnnotations = { arrows: [], danger: [], hint: [] };
  const arrow = (uci: string, kind: "better" | "threat") => {
    annotations.arrows.push({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      kind,
    });
  };
  if (attempt) {
    arrow(attempt.moveUci, "threat");
    arrow(analysis.moveUci, "better");
  } else if (kind === "great") {
    arrow(analysis.moveUci, "better");
  } else {
    arrow(analysis.moveUci, "threat");
    if (best && best.uci !== analysis.moveUci) arrow(best.uci, "better");
  }

  const mode = kind === "great" || kind === "fixed" ? "praise" : "explain";
  let text = renderMessage({
    kind: fact?.kind ?? "noFact",
    fact,
    kidColor,
    mode,
  }).text;
  if (kind === "fixed") text = t("coach.retryBetter");
  if (mode === "explain" && best && best.uci !== analysis.moveUci) {
    const revealFact = fact?.betterMoveUci === best.uci ? fact : undefined;
    text += ` ${
      renderMessage({
        kind: revealFact?.kind ?? "noFact",
        mode: "reveal",
        fact: revealFact,
        kidColor,
        playedMoveUci: analysis.moveUci,
      }).text
    }`;
  }
  const message: CoachMessage = {
    text,
    mode,
    ...(fact && kind !== "fixed" ? { fact, kind: fact.kind } : {}),
    pip: mode === "praise" ? "cheering" : "encouraging",
    grade:
      kind === "great"
        ? "great"
        : kind === "fixed"
          ? "good"
          : kind === "mistake"
            ? "oops"
            : "bigoops",
  };
  return { message, annotations };
}

export function ReviewScreen({
  state,
  onDone,
  brain,
  kidAge,
  stars,
  voiceOn = false,
  onToggleVoice,
}: {
  state: GameState;
  onDone: () => void;
  brain?: BrainStatus;
  kidAge?: number | null;
  stars?: number | null;
  voiceOn?: boolean;
  onToggleVoice?: () => void;
}) {
  const review = useMemo(() => reviewMoments(state), [state]);
  const fens = useMemo(() => {
    const board = new Chess(state.startFen);
    return state.history.map((move) => {
      const fen = board.fen();
      board.move(move.uci);
      return fen;
    });
  }, [state.history, state.startFen]);
  const [index, setIndex] = useState(0);
  const [wholeGame, setWholeGame] = useState(false);
  const [ply, setPly] = useState(1);
  const standing = state.analyses[ply];
  const selected = wholeGame
    ? standing &&
      (review.moments.find(({ analysis }) => analysis.ply === ply) ??
        (standing.grade === "mistake" || standing.grade === "blunder"
          ? ({ kind: standing.grade, analysis: standing } as const)
          : undefined))
    : review.moments[index];
  const analysis = selected?.analysis;
  const kind = selected?.kind;
  const note = useMemo(
    () =>
      analysis && kind
        ? reviewNote({ analysis, kind }, state.kidColor)
        : undefined,
    [analysis, kind, state.kidColor],
  );
  const message = useRephrasedMessage(
    note?.message,
    state.kidColor,
    kidAge,
    brain,
  );
  const voiceAvailable = useReadAloud(
    voiceOn,
    message?.pip !== "thinking" ? message?.text : undefined,
  );
  const fen = wholeGame
    ? (fens[ply - 1] ?? state.startFen)
    : (selected?.analysis.fenBefore ?? state.fen);
  const displayed = wholeGame ? state.history[ply - 1] : undefined;

  return (
    <main className="pp-app pp-game pp-review">
      <header className="pp-game__topbar">
        <h1>{t("review.title")}</h1>
        <button
          className="pp-btn pp-btn--secondary"
          type="button"
          onClick={onDone}
        >
          {t("review.done")}
        </button>
      </header>
      <div className="pp-game__layout">
        <section className="pp-game__board-column">
          <Board
            fen={fen}
            orientation={state.kidColor === "w" ? "white" : "black"}
            interactive={false}
            onMove={() => undefined}
            annotations={note?.annotations}
            lastMove={displayed}
          />
          {note?.annotations.arrows.length ? (
            <div className="pp-review__legend">
              {note.annotations.arrows.some(
                ({ kind }) => kind === "threat",
              ) && <span>{t("review.yourMove")}</span>}
              {note.annotations.arrows.some(
                ({ kind }) => kind === "better",
              ) && (
                <span className="pp-review__better">
                  {t(
                    selected?.kind === "great"
                      ? "review.greatMove"
                      : "review.better",
                  )}
                </span>
              )}
            </div>
          ) : null}
        </section>
        <section className="pp-game__side-column">
          <section className="pp-card pp-review__summary">
            <h2>
              {state.result
                ? t(resultMessageKey(state.result))
                : t("review.title")}
            </h2>
            {review.clean && <p>{t("review.clean")}</p>}
            {stars != null && <RewardStars count={stars} />}
            <ul>
              <li>{t("review.greatCount", { count: review.counts.great })}</li>
              <li>{t("review.goodCount", { count: review.counts.good })}</li>
              <li>{t("review.mistakes", { count: review.counts.mistakes })}</li>
              <li>{t("review.blunders", { count: review.counts.blunders })}</li>
              <li>{t("review.hints", { count: review.counts.hints })}</li>
            </ul>
          </section>
          {message ? (
            <CoachBubble
              message={message}
              speech={
                voiceAvailable && onToggleVoice
                  ? { enabled: voiceOn, onToggle: onToggleVoice }
                  : undefined
              }
            />
          ) : (
            review.clean && !wholeGame && <Pip mood="cheering" />
          )}
          {wholeGame ? (
            <ol className="pp-review__timeline" aria-label={t("game.moves")}>
              {state.history.map((move, index) => {
                const analysis = state.analyses[index + 1];
                const grade =
                  move.color !== state.kidColor
                    ? undefined
                    : !analysis
                      ? "ungraded"
                      : isGreatMove(analysis)
                        ? "great"
                        : analysis.grade === "mistake"
                          ? "oops"
                          : analysis.grade === "blunder"
                            ? "bigoops"
                            : "good";
                return (
                  <li key={index}>
                    <button
                      type="button"
                      className="pp-btn pp-btn--ghost"
                      aria-pressed={ply === index + 1}
                      onClick={() => setPly(index + 1)}
                    >
                      <span>
                        {t("review.move", {
                          number: Number(fens[index]?.split(" ")[5]),
                          move: move.san,
                        })}
                      </span>
                      {grade && <GradeChip grade={grade} />}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            review.moments.length > 1 && (
              <nav
                className="pp-library__actions"
                aria-label={t("review.title")}
              >
                <button
                  className="pp-btn pp-btn--secondary"
                  type="button"
                  onClick={() => setIndex(index - 1)}
                  disabled={index === 0}
                >
                  {t("review.previous")}
                </button>
                <span aria-live="polite">
                  {t("review.progress", {
                    current: index + 1,
                    total: review.moments.length,
                  })}
                </span>
                <button
                  className="pp-btn pp-btn--secondary"
                  type="button"
                  onClick={() => setIndex(index + 1)}
                  disabled={index + 1 === review.moments.length}
                >
                  {t("review.next")}
                </button>
              </nav>
            )
          )}
          {state.history.length > 0 && (
            <button
              className="pp-btn pp-btn--ghost"
              type="button"
              onClick={() => {
                if (!wholeGame) setPly(selected?.analysis.ply ?? 1);
                setWholeGame(!wholeGame);
              }}
            >
              {t(wholeGame ? "review.keyMoments" : "review.wholeGame")}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
