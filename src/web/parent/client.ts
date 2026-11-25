import type {
  RephraseRequestInput,
  RephraseResult,
} from "../../shared/coach/types.js";
import { ApiError, request } from "../game/libraryClient.js";

export type ParentStatus = {
  pinSet: boolean;
  unlocked: boolean;
  setup: boolean;
  retryAfterMs: number;
};
export type BrainSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
};
export type ModelList = {
  connected: boolean;
  models: string[];
  suggested: string;
};
export type BrainTest = RephraseResult & { elapsedMs: number };
export type BrainStatus = {
  enabled: boolean;
  paused: boolean;
  timeoutMs: number;
};
export type TabletSettings = {
  enabled: boolean;
  changing: boolean;
  failed: boolean;
  devices: { url: string; qr: string }[];
};

export const parent = {
  status: () => request<ParentStatus>("parent/status"),
  pin: (pin: string, confirm: string) =>
    request("parent/pin", "POST", { pin, confirm }),
  unlock: (pin: string) => request("parent/unlock", "POST", { pin }),
  finishSetup: () => request("parent/settings/finish-setup", "POST"),
  coach: () =>
    request<BrainSettings & { paused: boolean; hasApiKey: boolean }>(
      "parent/settings/coach",
    ),
  updateCoach: (settings: BrainSettings) =>
    request("parent/settings/coach", "PUT", settings),
  testCoach: (settings: BrainSettings) =>
    request<BrainTest>("parent/settings/coach/test", "POST", settings),
  models: (settings: BrainSettings) =>
    request<ModelList>("parent/settings/coach/models", "POST", settings),
  data: () => request<{ dataFolder: string }>("parent/settings/data"),
  network: () => request<TabletSettings>("parent/settings/network"),
  updateNetwork: (enabled: boolean) =>
    request("parent/settings/network", "PUT", { enabled }),
  reset: (confirm: string) =>
    request("parent/settings/reset", "POST", { confirm }),
};

export const localNetwork = () => request<{ showBanner: boolean }>("network");

export const coachApi = {
  status: () => request<BrainStatus>("coach/status"),
  phrase(input: RephraseRequestInput, signal: AbortSignal) {
    return fetch("/api/coach/rephrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    }).then((response) => {
      if (!response.ok) throw new ApiError(response.status);
      return response.json() as Promise<RephraseResult>;
    });
  },
};
