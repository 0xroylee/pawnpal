import { useMemo, useState } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { legalTargets, needsPromotion } from "../game/rules.js";
import { t } from "../i18n/t.js";
import type { BoardAnnotations } from "../coach/annotations.js";
import { BoardOverlay } from "./BoardOverlay.js";
import { PromotionPicker } from "./PromotionPicker.js";
import { horseyPieces } from "./pieces.js";
import { selectionReducer, type SelectionState } from "./selection.js";

export type BoardProps = {
  fen: string;
  orientation: "white" | "black";
  interactive: boolean;
  lastMove?: { from: string; to: string };
  checkSquare?: string;
  onMove: (move: { from: string; to: string; promotion?: string }) => void;
  animationMs?: number;
  engineBuild?: "lite" | "lite-single";
  annotations?: BoardAnnotations;
};

export function Board({
  fen,
  orientation,
  interactive,
  lastMove,
  checkSquare,
  onMove,
  animationMs = 150,
  engineBuild,
  annotations = EMPTY_ANNOTATIONS,
}: BoardProps) {
  const kidColor: Color = orientation === "white" ? "w" : "b";
  const [selection, setSelection] = useState<SelectionState>({
    selected: null,
    targets: [],
  });
  const [promotionMove, setPromotionMove] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);

  const captureTargets = selection.selected
    ? chess
        .moves({ square: selection.selected as Square, verbose: true })
        .filter((move) => move.captured || move.isEnPassant())
        .map((move) => move.to)
    : [];
  const clearSelection = () => setSelection({ selected: null, targets: [] });
  const completeMove = (from: string, to: string, promotion?: string) => {
    if (needsPromotion(fen, from, to) && !promotion) {
      setPromotionMove({ from, to });
      clearSelection();
      return;
    }
    if (!legalTargets(fen, from).includes(to)) {
      clearSelection();
      return;
    }
    clearSelection();
    onMove({ from, to, ...(promotion ? { promotion } : {}) });
  };

  const selectOrMove = (square: string, pieceColor?: "w" | "b" | null) => {
    const next = selectionReducer(
      selection,
      { square, pieceColor },
      {
        kidColor,
        legalTargets: (from) => legalTargets(fen, from),
        interactive,
      },
    );
    setSelection({ selected: next.selected, targets: next.targets });
    if (next.move) completeMove(next.move.from, next.move.to);
  };

  const options: ChessboardOptions = {
    id: "pawnpal-board",
    position: fen,
    boardOrientation: orientation,
    pieces: horseyPieces,
    lightSquareStyle: {
      backgroundColor: "var(--pp-board-light)",
      color: "var(--pp-board-coord-on-light)",
    },
    darkSquareStyle: {
      backgroundColor: "var(--pp-board-dark)",
      color: "var(--pp-board-coord-on-dark)",
    },
    animationDurationInMs: prefersReducedMotion() ? 0 : animationMs,
    allowDragging: interactive,
    canDragPiece: ({ piece }) => interactive && piece.pieceType[0] === kidColor,
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (
        !interactive ||
        !targetSquare ||
        !legalTargets(fen, sourceSquare).includes(targetSquare)
      ) {
        return false;
      }
      if (needsPromotion(fen, sourceSquare, targetSquare)) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        clearSelection();
        return false;
      }
      clearSelection();
      onMove({ from: sourceSquare, to: targetSquare });
      return true;
    },
    onSquareClick: ({ piece, square }) => {
      selectOrMove(square, piece ? (piece.pieceType[0] as Color) : null);
    },
    squareRenderer: ({ piece, square, children }) => {
      const color = chess.squareColor(square as Square);
      const classes = [
        "pp-sq",
        color === "light" ? "pp-sq--light" : "pp-sq--dark",
      ];
      if (square === selection.selected) classes.push("is-selected");
      if (selection.targets.includes(square)) {
        classes.push(
          captureTargets.includes(square as Square) || Boolean(piece)
            ? "has-capture"
            : "has-dot",
        );
      }
      if (square === checkSquare) classes.push("is-check");
      if (lastMove && (square === lastMove.from || square === lastMove.to))
        classes.push("is-last");
      const isDanger = annotations.danger.includes(square);
      if (isDanger) classes.push("is-danger");
      if (annotations.hint.includes(square)) classes.push("is-hint");
      const colorStyles: React.CSSProperties = {
        backgroundColor: `var(--pp-board-${color})`,
        color: `var(--pp-board-coord-on-${color})`,
      };
      return (
        <div
          className={classes.join(" ")}
          style={{
            ...colorStyles,
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            flex: "1 1 auto",
          }}
        >
          {children}
          {isDanger && (
            <span className="pp-sq__badge" aria-hidden="true">
              !
            </span>
          )}
        </div>
      );
    },
  };

  return (
    <div
      className={`pp-board${interactive ? "" : " is-locked"}`}
      data-engine-build={engineBuild}
      style={{
        display: "block",
      }}
    >
      <div
        role="group"
        aria-label={t("board.aria")}
        data-engine-build={engineBuild}
      >
        <Chessboard
          options={{
            ...options,
            boardStyle: {
              width: "100%",
              aspectRatio: "1",
              borderRadius: "var(--pp-board-radius)",
              overflow: "hidden",
              boxShadow: "var(--pp-shadow-board)",
            },
          }}
        />
      </div>
      <BoardOverlay arrows={annotations.arrows} orientation={orientation} />
      {promotionMove && (
        <PromotionPicker
          color={kidColor}
          onCancel={() => setPromotionMove(null)}
          onChoose={(promotion) => {
            const move = promotionMove;
            setPromotionMove(null);
            onMove({ ...move, promotion });
          }}
        />
      )}
    </div>
  );
}

const EMPTY_ANNOTATIONS: BoardAnnotations = {
  danger: [],
  hint: [],
  arrows: [],
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
