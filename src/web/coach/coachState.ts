import { Chess, type Color, type Square } from "chess.js";
import messages from "../i18n/en.json";
import {
  isCoachedGrade,
  type EngineLine,
  type FactKind,
  type MoveAnalysis,
} from "../../shared/coach/types.js";
import {
  annotationsFor,
  annotationsForHeld,
  type BoardAnnotations,
  type BetterMove,
} from "./annotations.js";
import { buildContext, runDetectors } from "./detectors/index.js";
import { selectFact } from "./detectors/priority.js";
import { pieceAt } from "./boardQueries.js";
import { renderMessage, pieceWord, type VariantHistory } from "./templates.js";

export type CoachGrade = "great" | "good" | "oops" | "bigoops";
export type CoachPip =
  "happy" | "thinking" | "surprised" | "cheering" | "encouraging";
export type CoachMessageMode =
  "nudge" | "explain" | "reveal" | "praise" | "hint1" | "hint2" | "hint3";

export type CoachMessage = {
  text: string;
  mode: CoachMessageMode;
  kind?: FactKind;
  grade?: CoachGrade;
  pip: CoachPip;
  late?: boolean;
};

export type CoachState = {
  message?: CoachMessage;
  annotations: BoardAnnotations;
  lastPraisePly: number;
  variantHistory: VariantHistory;
};

export type CoachEvent =
  | { type: "GRADED"; analysis: MoveAnalysis }
  | {
      type: "HINT";
      tier: 1 | 2 | 3;
      lines?: EngineLine[];
      fen: string;
      ply: number;
    }
  | { type: "KID_MOVED" }
  | { type: "DISMISS" }
  | { type: "PRAISE_EXPIRED" }
  | { type: "NEW_GAME" };

export type CoachDependencies = { variantSeed: number; kidColor: Color };

const EMPTY_ANNOTATIONS: BoardAnnotations = {
  danger: [],
  hint: [],
  arrows: [],
};

export const initialCoachState: CoachState = {
  annotations: EMPTY_ANNOTATIONS,
  lastPraisePly: Number.NEGATIVE_INFINITY,
  variantHistory: {},
};

export function coachReducer(
  state: CoachState,
  event: CoachEvent,
  deps: CoachDependencies,
): CoachState {
  switch (event.type) {
    case "GRADED":
      return gradedState(state, event.analysis, deps);
    case "HINT":
      return hintState(state, event, deps);
    case "KID_MOVED":
    case "DISMISS":
      return {
        ...state,
        message: undefined,
        annotations: emptyAnnotations(),
      };
    case "PRAISE_EXPIRED":
      return state.message?.mode === "praise"
        ? { ...state, message: undefined }
        : state;
    case "NEW_GAME":
      return initialCoachState;
  }
}

function gradedState(
  state: CoachState,
  analysis: MoveAnalysis,
  deps: CoachDependencies,
): CoachState {
  const fact = selectFact(analysis.facts);

  if (isCoachedGrade(analysis.grade)) {
    const kind = fact?.kind ?? "noFact";
    const explain = renderMessage({
      kind,
      mode: analysis.late ? "late" : "explain",
      fact,
      history: state.variantHistory,
      variantSeed: deps.variantSeed,
      kidColor: deps.kidColor,
    });

    if (analysis.late) {
      return {
        ...state,
        message: {
          text: explain.text,
          mode: "explain",
          ...(fact ? { kind: fact.kind } : {}),
          grade: analysis.grade === "mistake" ? "oops" : "bigoops",
          pip: "surprised",
          late: true,
        },
        annotations: emptyAnnotations(),
        variantHistory: explain.history!,
      };
    }

    return {
      ...state,
      message: {
        text: explain.text,
        mode: "explain",
        ...(fact ? { kind: fact.kind } : {}),
        grade: analysis.grade === "mistake" ? "oops" : "bigoops",
        pip: "surprised",
      },
      annotations: annotationsForHeld(
        fact,
        positionAfterMove(analysis),
        deps.kidColor,
      ),
      variantHistory: explain.history!,
    };
  }

  if (analysis.isOnlyMove && analysis.ply - state.lastPraisePly >= 5) {
    const praiseFact = analysis.facts.find(
      (candidate) => candidate.kind === "played-fork",
    );
    const praise = renderMessage({
      kind: praiseFact?.kind ?? "noFact",
      mode: "praise",
      fact: praiseFact,
      history: state.variantHistory,
      variantSeed: deps.variantSeed,
      kidColor: deps.kidColor,
    });
    return {
      ...state,
      message: {
        text: praise.text,
        mode: "praise",
        ...(praiseFact ? { kind: praiseFact.kind } : {}),
        grade: "great",
        pip: "cheering",
      },
      annotations: emptyAnnotations(),
      lastPraisePly: analysis.ply,
      variantHistory: praise.history!,
    };
  }

  return {
    ...state,
    message: undefined,
    annotations: emptyAnnotations(),
  };
}

function hintState(
  state: CoachState,
  event: Extract<CoachEvent, { type: "HINT" }>,
  deps: CoachDependencies,
): CoachState {
  const bestLine = event.lines?.[0];
  const better = moveFromUci(bestLine?.uci);
  if (!bestLine || !better) {
    return {
      ...state,
      annotations: emptyAnnotations(),
      message: {
        text: messages["coach.thinking"],
        mode: `hint${event.tier}`,
        pip: "thinking",
      },
    };
  }

  const facts = runDetectors(
    buildContext({
      analysis: { fen: event.fen, lines: event.lines ?? [] },
      kidColor: deps.kidColor,
    }),
  );
  const fact = selectFact(facts);
  const messageMode = `hint${event.tier}` as const;
  const templateFact = event.tier === 2 ? fact : undefined;
  const kind = event.tier === 2 ? (fact?.kind ?? "noFact") : "noFact";
  const movingPiece =
    event.tier === 1 ? pieceAt(event.fen, better.from as Square) : undefined;
  const hint = renderMessage({
    kind,
    mode: messageMode,
    fact: templateFact,
    params: movingPiece ? { piece: pieceWord(movingPiece) } : undefined,
    history: state.variantHistory,
    variantSeed: deps.variantSeed,
    kidColor: deps.kidColor,
  });

  return {
    ...state,
    message: {
      text: hint.text,
      mode: messageMode,
      ...(templateFact ? { kind: templateFact.kind } : {}),
      pip: "encouraging",
    },
    annotations: annotationsFor(undefined, messageMode, better),
    variantHistory: hint.history!,
  };
}

function moveFromUci(uci: string | undefined): BetterMove | undefined {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return undefined;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function positionAfterMove(analysis: MoveAnalysis): string {
  const move = moveFromUci(analysis.moveUci);
  if (!move) return analysis.fenBefore;
  const chess = new Chess(analysis.fenBefore);
  chess.move({
    from: move.from as Square,
    to: move.to as Square,
    ...(analysis.moveUci[4]
      ? { promotion: analysis.moveUci[4] as "q" | "r" | "b" | "n" }
      : {}),
  });
  return chess.fen();
}

function emptyAnnotations(): BoardAnnotations {
  return { danger: [], hint: [], arrows: [] };
}
