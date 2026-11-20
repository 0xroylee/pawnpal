import { createContext } from "react";
import type { EngineClient } from "./EngineClient.js";
import type { EngineSelection } from "./chooseBuild.js";

export type EngineInitializationOptions = {
  analyst?: () => EngineClient;
};

export type EngineContextValue = {
  opponent: EngineClient | null;
  analyst: EngineClient | null;
  build: EngineSelection | null;
  initialize: (options?: EngineInitializationOptions) => Promise<EngineClient>;
};

export const EngineContext = createContext<EngineContextValue | null>(null);
