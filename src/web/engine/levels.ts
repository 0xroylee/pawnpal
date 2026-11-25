import { Chess } from "chess.js";
import type { Difficulty } from "../../shared/game/difficulty.js";
import { see } from "../coach/see.js";
import type { EngineClient, EngineLine } from "./EngineClient.js";

type SamplingPolicy = {
  multiPv: number;
  depth: number;
  temperature: number;
  slipProbability: number;
  captureBonus: number;
  slipLoss?: readonly [minimum: number, maximum: number];
};

export const samplingPolicies: Record<
  Exclude<Difficulty, 8>,
  SamplingPolicy
> = {
  1: {
    multiPv: 20,
    depth: 1,
    temperature: 300,
    slipProbability: 0.35,
    captureBonus: 150,
  },
  2: {
    multiPv: 20,
    depth: 2,
    temperature: 200,
    slipProbability: 0.25,
    captureBonus: 100,
  },
  3: {
    multiPv: 16,
    depth: 2,
    temperature: 185,
    slipProbability: 0.23,
    captureBonus: 50,
    slipLoss: [100, 2000],
  },
  4: {
    multiPv: 14,
    depth: 2,
    temperature: 168,
    slipProbability: 0.18,
    captureBonus: 0,
    slipLoss: [90, 1800],
  },
  5: {
    multiPv: 12,
    depth: 3,
    temperature: 162,
    slipProbability: 0.19,
    captureBonus: 0,
    slipLoss: [90, 1300],
  },
  6: {
    multiPv: 11,
    depth: 3,
    temperature: 135,
    slipProbability: 0.15,
    captureBonus: 0,
    slipLoss: [85, 900],
  },
  7: {
    multiPv: 10,
    depth: 4,
    temperature: 130,
    slipProbability: 0.15,
    captureBonus: 0,
    slipLoss: [90, 1100],
  },
};

export const dragonElo = 1350;
const searchTimeMs = 650;
const limitedSearch = { depth: 10, movetimeMs: searchTimeMs };
export type OpponentEngine = Pick<
  EngineClient,
  "analyze" | "bestMove" | "setOptions" | "newGame"
>;

export function configureOpponent(
  engine: Pick<OpponentEngine, "setOptions">,
  level: Difficulty,
  elo = dragonElo,
): Promise<void> {
  return engine.setOptions({
    "Skill Level": 20,
    UCI_LimitStrength: level === 8,
    ...(level === 8 ? { UCI_Elo: elo } : {}),
  });
}

export function chooseLimitedMove(
  fen: string,
  engine: Pick<OpponentEngine, "bestMove">,
): Promise<string> {
  return engine.bestMove(fen, limitedSearch);
}

function centipawns({ cp, mate }: EngineLine): number {
  return mate === undefined
    ? (cp ?? 0)
    : Math.sign(mate) * (100_000 - Math.abs(mate));
}

export async function chooseMove(
  fen: string,
  level: Difficulty,
  rng: () => number,
  engine: Pick<OpponentEngine, "analyze" | "bestMove">,
): Promise<string> {
  const board = new Chess(fen);
  const legal = board.moves({ verbose: true });
  if (!legal.length) throw new Error("The position has no legal move");
  if (legal.length === 1) return legal[0]!.lan;

  if (level >= 3) {
    const mate = legal.find((move) => move.san.endsWith("#"));
    if (mate) return mate.lan;
    const queen = legal.find(
      (move) =>
        move.captured === "q" &&
        see(move.after, move.to, board.turn() === "w" ? "b" : "w") <= 0,
    );
    if (queen) return queen.lan;
  }

  if (level === 8) return chooseLimitedMove(fen, engine);

  const policy = samplingPolicies[level];
  const slips = rng() < policy.slipProbability;
  if (slips && !policy.slipLoss) {
    return legal[Math.floor(rng() * legal.length)]!.lan;
  }

  const lines = await engine.analyze(fen, {
    depth: policy.depth,
    multiPv: policy.multiPv,
    movetimeMs: searchTimeMs,
  });
  const legalByUci = new Map(legal.map((move) => [move.lan, move]));
  const candidates = [
    ...new Map(lines.map((line) => [line.uci, line])).values(),
  ]
    .filter((line) => legalByUci.has(line.uci))
    .map((line) => ({
      uci: line.uci,
      cp: centipawns(line),
      bonus: legalByUci.get(line.uci)?.captured ? policy.captureBonus : 0,
    }));
  if (!candidates.length) return legal[0]!.lan;

  if (slips && policy.slipLoss) {
    const [minimum, maximum] = policy.slipLoss;
    const best = Math.max(...candidates.map(({ cp }) => cp));
    const plausible = candidates.filter(
      ({ cp }) => best - cp >= minimum && best - cp <= maximum,
    );
    if (plausible.length)
      return plausible[Math.floor(rng() * plausible.length)]!.uci;
  }

  const maximum = Math.max(...candidates.map(({ cp, bonus }) => cp + bonus));
  const weights = candidates.map(({ cp, bonus }) =>
    Math.exp((cp + bonus - maximum) / policy.temperature),
  );
  let remaining = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, weight] of weights.entries()) {
    remaining -= weight;
    if (remaining < 0) return candidates[index]!.uci;
  }
  return candidates.at(-1)!.uci;
}
