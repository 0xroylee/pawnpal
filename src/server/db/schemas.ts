import type { Square } from "chess.js";
import { z } from "zod";
import { isDifficulty, type Difficulty } from "../../shared/game/difficulty.ts";
import { avatars } from "../../shared/game/library.ts";
import { replayGame } from "../../shared/game/record.ts";
import type { GameState } from "../../shared/game/types.ts";

const level = z.custom<Difficulty>(
  isDifficulty,
  "Expected a level from 1 to 8",
);

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  avatar: z.enum(avatars),
  age: z.number().int().min(1).max(120).nullable().optional(),
  level: level.optional(),
  voiceOn: z.boolean().optional(),
  soundOn: z.boolean().optional(),
  tryAgainOn: z.boolean().optional(),
});
export const profilePatchSchema = profileSchema.partial();
export const preferencesSchema = z.strictObject({
  soundOn: z.boolean().optional(),
  voiceOn: z.boolean().optional(),
});
const id = z.uuid();
const color = z.enum(["w", "b"]);
const grade = z.enum(["best", "good", "inaccuracy", "mistake", "blunder"]);
const ending = z.enum([
  "checkmate",
  "stalemate",
  "threefold",
  "fifty-move",
  "insufficient",
]);
const square = z.custom<Square>(
  (value) => typeof value === "string" && /^[a-h][1-8]$/.test(value),
);
const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
const plyKey = z.string().regex(/^[1-9]\d*$/);
const counter = z.number().int().nonnegative();
const hint = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const piece = z.object({
  type: z.enum(["p", "n", "b", "r", "q", "k"]),
  color,
  square,
});
const engineLine = z.object({
  uci,
  san: z.string(),
  cp: z.number().optional(),
  mate: z.number().optional(),
  pv: z.array(uci),
  depth: counter,
});
const fact = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum([
    "allowed-mate",
    "missed-mate",
    "hanging-piece",
    "allowed-fork",
    "missed-capture",
    "missed-fork",
    "threat",
    "played-fork",
  ]),
  pieces: z.array(piece),
  moves: z.array(z.string()),
  squares: z.array(square),
  betterMoveSan: z.string().optional(),
  betterMoveUci: uci.optional(),
  mateIn: z.number().optional(),
  subject: piece.optional(),
  attacker: piece.optional(),
  betterMover: piece.optional(),
  targets: z.array(piece).optional(),
  threatMoveSan: z.string().optional(),
  threatMoveUci: uci.optional(),
});
const attempt = z.object({
  moveUci: uci,
  moveSan: z.string(),
  grade,
  usedShowMe: z.boolean(),
  revealed: z.boolean(),
});
const analysis = z.object({
  ply: z.number().int().positive(),
  fenBefore: z.string(),
  moveUci: uci,
  moveSan: z.string(),
  linesBefore: z.array(engineLine),
  linesAfter: z.array(engineLine),
  winBefore: z.number().min(0).max(100),
  winAfter: z.number().min(0).max(100),
  drop: z.number(),
  grade,
  isOnlyMove: z.boolean(),
  facts: z.array(fact),
  late: z.boolean().optional(),
  attempts: z.array(attempt).optional(),
  hintTier: hint.optional(),
});
const stateShape = z.object({
  phase: z.enum([
    "kidToMove",
    "grading",
    "nudge",
    "reveal",
    "opponentToMove",
    "over",
  ]),
  fen: z.string(),
  startFen: z.string(),
  kidColor: color,
  level: level.optional(),
  history: z.array(
    z.object({
      san: z.string(),
      uci,
      from: square,
      to: square,
      color,
      ending: ending.optional(),
    }),
  ),
  lastMove: z.object({ from: square, to: square }).optional(),
  checkSquare: square.optional(),
  result: z
    .object({
      winner: z.enum(["kid", "opponent", "draw"]),
      reason: z.union([ending, z.literal("resign")]),
    })
    .optional(),
  gameToken: counter,
  turnToken: counter,
  analyses: z.record(plyKey, analysis),
  hintTier: hint,
  pendingGrades: z.record(
    plyKey,
    z.object({
      turnToken: counter,
      hintTier: hint,
      attempts: z.array(attempt).optional(),
    }),
  ),
  offerTryAgain: z.boolean(),
  retry: z
    .object({
      original: analysis,
      attempts: z.array(attempt),
      reveal: analysis.optional(),
    })
    .optional(),
});

export const gameStateSchema: z.ZodType<GameState> = stateShape.refine(
  (state) => {
    try {
      const board = replayGame(state);
      const kidTurn = state.phase === "kidToMove" || state.phase === "reveal";
      const ply = state.history.length;
      return (
        board.fen() === state.fen &&
        (state.phase === "over") === Boolean(state.result) &&
        (state.phase === "over" ||
          kidTurn === (board.turn() === state.kidColor)) &&
        (state.phase !== "nudge" || Boolean(state.analyses[String(ply)])) &&
        (state.phase !== "reveal" || Boolean(state.retry?.reveal)) &&
        (state.phase !== "grading" ||
          state.pendingGrades[String(ply)]?.turnToken === state.turnToken)
      );
    } catch {
      return false;
    }
  },
  "Game state does not match its moves",
);

export const startGameSchema = z.object({
  profileId: id,
  replaceActiveGameId: id.optional(),
  state: gameStateSchema,
});
export const saveGameSchema = z.object({
  revision: counter,
  state: gameStateSchema,
});
export const listGamesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: id.optional(),
});
export const suggestionResponseSchema = z.object({
  id: z.number().int().positive(),
  response: z.enum(["accepted", "declined"]),
});

export const llmSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .default("http://127.0.0.1:11434/v1"),
  model: z.string().max(256).default(""),
  apiKey: z.string().max(4096).optional(),
  timeoutMs: z.number().int().positive().max(3000).default(3000),
});
export const rephraseSchema = z.object({
  fact,
  mode: z.enum(["nudge", "explain", "reveal", "praise", "hint"]),
  templateText: z.string().min(1).max(500),
  kidColor: color.default("w"),
  kidAge: z.number().int().min(1).max(120).optional(),
  language: z.literal("en"),
});
