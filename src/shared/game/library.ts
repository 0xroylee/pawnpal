import type { Color } from "chess.js";
import type { Difficulty } from "./difficulty.js";
import type { Badge } from "./rewards.js";
import type { GameState } from "./types.js";

export const avatars = [
  "bear",
  "fox",
  "owl",
  "cat",
  "frog",
  "rabbit",
  "panda",
  "penguin",
  "tiger",
  "koala",
  "dog",
  "mouse",
] as const;
export type Avatar = (typeof avatars)[number];
export type Profile = {
  id: string;
  name: string;
  avatar: Avatar;
  age: number | null;
  level: Difficulty;
  voiceOn: boolean;
  soundOn: boolean;
  tryAgainOn: boolean;
  activeGameId: string | null;
};
export type ProfileSettings = Omit<Profile, "id" | "activeGameId">;
export type GameOutcome = "win" | "loss" | "draw";
export type GameSummary = {
  id: string;
  profileId: string;
  level: Difficulty;
  kidColor: Color;
  status: "active" | "finished" | "aborted";
  result: GameOutcome | null;
  termination: string | null;
  startedAt: string;
  endedAt: string | null;
  stars?: number | null;
};
export type SavedGame = GameSummary & {
  revision: number;
  pgn: string;
  state: GameState;
  newBadges?: Badge[];
};
export type GamePage = { games: GameSummary[]; nextCursor: string | null };
export type ProfileStats = {
  levels: {
    level: number;
    games: number;
    wins: number;
    losses: number;
    draws: number;
  }[];
  recentBlunders: { gameId: string; blunders: number }[];
};
export type LevelSuggestion = {
  id: number;
  direction: "up" | "down";
  level: number;
};
