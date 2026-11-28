import { useState } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import { Bot, Flag, House, UserRound, Volume2, VolumeX } from "lucide-react";
import { Board } from "../board/Board.js";
import {
  gameRecord,
  type GameAction,
  type GameState,
} from "../game/reducer.js";
import { useCoach } from "../game/useCoach.js";
import { useRephrasedMessage } from "../game/useRephrasedMessage.js";
import type { BrainStatus } from "../parent/client.js";
import type { Badge } from "../../shared/game/rewards.js";
import { useReadAloud } from "../sound/readAloud.js";
import type { SaveStatus } from "../game/autosave.js";
import { DebugPanel } from "../dev/DebugPanel.js";
import { t, type MessageKey } from "../i18n/t.js";
import { CoachFeedback } from "./CoachFeedback.js";
import { MoveList } from "./MoveList.js";
import { ResultScreen } from "./ResultScreen.js";
import { Pip } from "./Pip.js";
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
  dev = false,
  onLeave,
  onReview,
  saveStatus,
  onRetrySave,
  brain,
  kidAge,
  stars,
  newBadges,
  voiceOn = false,
  onToggleVoice,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
  muted: boolean;
  onToggleSound: () => void;
  engineBuild?: "lite" | "lite-single";
  dev?: boolean;
  onLeave?: (destination: "home" | "playAgain") => void;
  onReview?: () => void;
  saveStatus?: SaveStatus;
  onRetrySave?: () => void;
  brain?: BrainStatus;
  kidAge?: number | null;
  stars?: number | null;
  newBadges?: Badge[];
  voiceOn?: boolean;
  onToggleVoice?: () => void;
}) {
  const [confirmResign, setConfirmResign] = useState(false);
  const { coach, dismiss } = useCoach(state);
  const coachMessage = useRephrasedMessage(
    coach.message,
    state.kidColor,
    kidAge,
    brain,
  );
  const coachAnnotations = coach.annotations;
  const spoken = newBadges?.length
    ? newBadges
        .map(({ id }) =>
          t("rewards.newBadge", { badge: t(`rewards.badge.${id}`) }),
        )
        .join(" ")
    : coachMessage?.pip !== "thinking"
      ? coachMessage?.text
      : undefined;
  const voiceAvailable = useReadAloud(voiceOn, spoken);
  const kidTurn = state.phase === "kidToMove";
  const opponentThinking =
    state.phase === "opponentToMove" || state.phase === "grading";
  const hintReason =
    state.phase === "nudge" || state.phase === "reveal"
      ? t("hint.why.coach")
      : opponentThinking
        ? t("hint.why.wait")
        : kidTurn && state.hintTier >= 3
          ? t("hint.why.used")
          : undefined;
  const status =
    state.phase === "kidToMove"
      ? t("game.yourTurn")
      : state.phase === "nudge" || state.phase === "reveal"
        ? t("game.coachTurn")
        : opponentThinking
          ? t("game.thinking")
          : state.result
            ? t("game.title")
            : t("game.yourTurn");
  const moveAnnouncement =
    state.retry && (kidTurn || state.phase === "reveal")
      ? null
      : opponentMoveAnnouncement(state);
  const resultAnnouncement = state.result
    ? t(resultMessageKey(state.result))
    : null;
  const statusAnnouncement = state.result
    ? [moveAnnouncement, resultAnnouncement].filter(Boolean).join(" ")
    : (moveAnnouncement ?? status);
  const liveAnnouncement = [coachMessage?.text, statusAnnouncement]
    .filter(Boolean)
    .join(" ");
  const requestHint = () => {
    if (!kidTurn || state.hintTier >= 3) return;
    dispatch({ type: "HINT", tier: (state.hintTier + 1) as 1 | 2 | 3 });
  };
  const dismissCoach = () => {
    dismiss();
    if (state.phase === "reveal") dispatch({ type: "REVEAL_OK" });
  };
  const leave = (destination: "home" | "playAgain") => {
    if (onLeave) onLeave(destination);
    else dispatch({ type: "PLAY_AGAIN" });
  };
  const opponent = (place: "top" | "board") => (
    <div className={`pp-player pp-game__opponent pp-game__opponent--${place}`}>
      <span className="pp-avatar" aria-hidden="true">
        <Bot aria-hidden="true" focusable="false" />
      </span>
      <span className="pp-player__name">{t("game.opponent")}</span>
      {place === "board" ? (
        <span className="pp-player__status">
          {opponentThinking ? t("game.thinking") : ""}
        </span>
      ) : (
        opponentThinking && (
          <span className="pp-player__status" aria-hidden="true">
            <span className="pp-typing">
              <i />
              <i />
              <i />
            </span>
          </span>
        )
      )}
    </div>
  );

  return (
    <main
      className={`pp-app pp-game${state.result ? " pp-game--over" : ""}`}
      style={{ paddingBottom: "var(--pp-safe-bottom)" }}
    >
      {state.result ? (
        <ResultScreen
          state={state}
          stars={stars}
          badges={newBadges}
          onReview={onReview}
          onPlayAgain={() => leave("playAgain")}
          onHome={onReview ? () => leave("home") : undefined}
        />
      ) : (
        <>
          <header className="pp-game__topbar">
            <button
              className="pp-btn pp-btn--secondary pp-btn--sm pp-game__home"
              type="button"
              onClick={() => leave("home")}
            >
              <House aria-hidden="true" focusable="false" />
              {t("game.home")}
            </button>
            <h1 className="pp-game__title">{t("game.title")}</h1>
            {opponent("top")}
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
              {opponent("board")}
              <Board
                fen={state.fen}
                orientation={state.kidColor === "w" ? "white" : "black"}
                interactive={kidTurn}
                lastMove={state.lastMove}
                checkSquare={state.checkSquare}
                onMove={(move) => dispatch({ type: "KID_MOVE", ...move })}
                engineBuild={engineBuild}
                annotations={coachAnnotations}
              />
              <div className="pp-player">
                <span className="pp-avatar" aria-hidden="true">
                  <UserRound aria-hidden="true" focusable="false" />
                </span>
                <span className="pp-player__name">{t("game.kid")}</span>
                <span className="pp-player__status">
                  {kidTurn ? t("game.yourTurn") : ""}
                </span>
                {!state.result && hintReason && (
                  <span className="pp-player__why" id="hint-why">
                    {hintReason}
                  </span>
                )}
                {!state.result && (
                  <button
                    className="pp-btn pp-btn--secondary pp-btn--sm pp-player__hint"
                    type="button"
                    disabled={!kidTurn || state.hintTier >= 3}
                    aria-describedby={hintReason ? "hint-why" : undefined}
                    onClick={requestHint}
                  >
                    {t(state.hintTier === 0 ? "hint.button" : "hint.more")}
                  </button>
                )}
              </div>
            </section>
            <aside className="pp-game__side-column">
              {(coachMessage || !state.result) && (
                <div className="pp-game__coach">
                  {coachMessage ? (
                    <CoachFeedback
                      message={coachMessage}
                      onDismiss={dismissCoach}
                      speech={
                        voiceAvailable && onToggleVoice
                          ? { enabled: voiceOn, onToggle: onToggleVoice }
                          : undefined
                      }
                      retryActions={
                        state.phase === "nudge"
                          ? {
                              tryAgain: () => dispatch({ type: "TRY_AGAIN" }),
                              showMe: () => dispatch({ type: "SHOW_ME" }),
                              keepMove: () => dispatch({ type: "KEEP_MOVE" }),
                            }
                          : undefined
                      }
                    />
                  ) : (
                    !state.result && <Pip mood="happy" />
                  )}
                </div>
              )}
              <MoveList moves={state.history} />
            </aside>
          </div>
        </>
      )}
      <p className="pp-game__live" aria-live="polite">
        {liveAnnouncement}
      </p>
      {saveStatus && (
        <div className="pp-library__save">
          <span role="status">{t(`library.save.${saveStatus}`)}</span>
          {saveStatus === "failed" && (
            <button
              className="pp-btn pp-btn--secondary pp-btn--sm"
              type="button"
              onClick={onRetrySave}
            >
              {t("library.retry")}
            </button>
          )}
        </div>
      )}
      {dev && (
        <>
          <DebugPanel analyses={state.analyses} kidColor={state.kidColor} />
          <output hidden data-testid="debug-game-record">
            {JSON.stringify(gameRecord(state))}
          </output>
          <output
            className="pp-debug-panel__facts"
            data-testid="debug-facts"
            aria-label={t("debug.facts")}
          >
            {Object.values(state.analyses)
              .flatMap((analysis) => analysis.facts)
              .map((fact, index) => (
                <span data-fact-kind={fact.kind} key={`${fact.kind}-${index}`}>
                  {fact.kind}
                </span>
              ))}
          </output>
        </>
      )}
    </main>
  );
}
