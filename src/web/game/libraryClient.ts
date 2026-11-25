import type {
  GamePage,
  LevelSuggestion,
  Profile,
  ProfileSettings,
  ProfileStats,
  SavedGame,
} from "../../shared/game/library.js";
import type { GameState } from "./reducer.js";
import type { Badge } from "../../shared/game/rewards.js";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Pawnpal returned HTTP ${status}`);
  }
}

export async function request<T>(
  path: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    ...(value === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }),
  });
  if (!response.ok) throw new ApiError(response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const library = {
  listProfiles: () => request<Profile[]>("profiles"),
  createProfile: (
    profile: Pick<ProfileSettings, "name" | "avatar"> &
      Partial<ProfileSettings>,
  ) => request<Profile>("profiles", "POST", profile),
  updateProfile: (id: string, patch: Partial<ProfileSettings>) =>
    request<Profile>(`profiles/${id}`, "PATCH", patch),
  preferences: (
    id: string,
    patch: Partial<Pick<ProfileSettings, "soundOn" | "voiceOn">>,
  ) => request<Profile>(`profiles/${id}/preferences`, "PATCH", patch),
  deleteProfile: (id: string) => request<void>(`profiles/${id}`, "DELETE"),
  startGame: (
    profileId: string,
    state: GameState,
    replaceActiveGameId?: string,
  ) =>
    request<SavedGame>("games", "POST", {
      profileId,
      state,
      replaceActiveGameId,
    }),
  getGame: (id: string) => request<SavedGame>(`games/${id}`),
  saveGame: (id: string, revision: number, state: GameState) =>
    state.result
      ? request<SavedGame>(`games/${id}/finish`, "POST", { revision, state })
      : request<SavedGame>(`games/${id}`, "PUT", { revision, state }),
  listGames: (id: string, cursor?: string) =>
    request<GamePage>(
      `profiles/${id}/games${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  stats: (id: string) => request<ProfileStats>(`profiles/${id}/stats`),
  badges: (id: string) => request<Badge[]>(`profiles/${id}/badges`),
  suggestion: (id: string) =>
    request<LevelSuggestion | null>(`profiles/${id}/suggestion`),
  respond: (profileId: string, id: number, response: "accepted" | "declined") =>
    request<Profile>(`profiles/${profileId}/suggestion`, "POST", {
      id,
      response,
    }),
};
