import { useState } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import { Bot, Flag, House, UserRound, Volume2, VolumeX } from "lucide-react";
import { Board } from "../board/Board.js";
import type { GameAction, GameState } from "../game/reducer.js";
import { t, type MessageKey } from "../i18n/t.js";
import { MoveList } from "./MoveList.js";
import { ResultBanner } from "./ResultBanner.js";
import { resultMessageKey } from "./resultMessage.js";

const pieceMessageKeys: Record<PieceSymbol, MessageKey> = {
  p: "piece.pawn",
  n: "piece.knight",
  b: "piece.bishop",
  r: "piece.rook",
  q: "piece.queen",
  k: "piece.king",
};

function opponentMoveAnnouncement(state: GameState): string | null {
  const move = state.history.at(-1);
  if (
    !move ||
    move.color === state.kidColor ||
    state.result?.reason === "resign"
  ) {
    return null;
  }
  const piece = move.uci[4]
    ? "p"
    : new Chess(state.fen).get(move.to as Square)?.type;
  if (!piece) return null;
  return t("game.opponentMoved", {
    opponent: t("game.opponent"),
    piece: t(pieceMessageKeys[piece]),
    square: move.to,
  });
}

export function GameScreen({
  state,
  dispatch,
  muted,
  onToggleSound,
  engineBuild,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
  muted: boolean;
  onToggleSound: () => void;
  engineBuild?: "lite" | "lite-single";
}) {
  const [confirmResign, setConfirmResign] = useState(false);
  const kidTurn = state.phase === "kidToMove";
  const status =
    state.phase === "kidToMove"
      ? t("game.yourTurn")
      : state.phase === "opponentToMove"
        ? t("game.thinking")
        : state.result
          ? t("game.title")
          : t("game.yourTurn");
  const moveAnnouncement = opponentMoveAnnouncement(state);
  const resultAnnouncement = state.result
    ? t(resultMessageKey(state.result))
    : null;
  const liveAnnouncement = state.result
    ? [moveAnnouncement, resultAnnouncement].filter(Boolean).join(" ")
    : (moveAnnouncement ?? status);

  return (
    <main
      className="pp-app pp-game"
      style={{ paddingBottom: "var(--pp-safe-bottom)" }}
    >
      <header className="pp-game__topbar">
        <button
          className="pp-btn pp-btn--secondary pp-btn--sm pp-game__home"
          type="button"
          onClick={() => dispatch({ type: "PLAY_AGAIN" })}
        >
          <House aria-hidden="true" focusable="false" />
          {t("game.home")}
        </button>
        <h1>{t("game.title")}</h1>
        <div className="pp-game__actions">
          <button
            className="pp-iconbtn"
            type="button"
            aria-label={muted ? t("game.soundUnmute") : t("game.soundMute")}
            onClick={onToggleSound}
          >
            {muted ? (
              <VolumeX aria-hidden="true" focusable="false" />
            ) : (
              <Volume2 aria-hidden="true" focusable="false" />
            )}
          </button>
          {state.phase !== "over" && (
            <button
              className="pp-btn pp-btn--ghost"
              type="button"
              onClick={() => setConfirmResign(true)}
            >
              <Flag aria-hidden="true" focusable="false" />
              {t("game.giveUp")}
            </button>
          )}
        </div>
      </header>

      {confirmResign && state.phase !== "over" && (
        <div
          className="pp-game__confirm"
          role="group"
          aria-label={t("game.confirmGiveUp")}
        >
          <span>{t("game.confirmGiveUp")}</span>
          <button
            className="pp-btn pp-btn--secondary pp-btn--sm"
            type="button"
            onClick={() => dispatch({ type: "RESIGN" })}
          >
            {t("game.yesGiveUp")}
          </button>
          <button
            className="pp-btn pp-btn--ghost pp-btn--sm"
            type="button"
            onClick={() => setConfirmResign(false)}
          >
            {t("game.keepPlaying")}
          </button>
        </div>
      )}

      <div className="pp-game__layout">
        <section className="pp-game__board-column">
          <div className="pp-player">
            <span className="pp-avatar" aria-hidden="true">
              <Bot aria-hidden="true" focusable="false" />
            </span>
            <span className="pp-player__name">{t("game.opponent")}</span>
            <span className="pp-player__status">
              {state.phase === "opponentToMove" ? t("game.thinking") : ""}
            </span>
          </div>
          <Board
            fen={state.fen}
            orientation={state.kidColor === "w" ? "white" : "black"}
            interactive={kidTurn}
            lastMove={state.lastMove}
            checkSquare={state.checkSquare}
            onMove={(move) => dispatch({ type: "KID_MOVE", ...move })}
            engineBuild={engineBuild}
          />
          <div className="pp-player">
            <span className="pp-avatar" aria-hidden="true">
              <UserRound aria-hidden="true" focusable="false" />
            </span>
            <span className="pp-player__name">{t("game.kid")}</span>
            <span className="pp-player__status">
              {kidTurn ? t("game.yourTurn") : ""}
            </span>
          </div>
        </section>
        <aside className="pp-game__side-column">
          <p className="pp-game__live" aria-live="polite">
            {liveAnnouncement}
          </p>
          {state.result && (
            <ResultBanner
              result={state.result}
              onPlayAgain={() => dispatch({ type: "PLAY_AGAIN" })}
            />
          )}
          <MoveList moves={state.history} />
        </aside>
      </div>
    </main>
  );
}
