import { createContext } from "react";
import type { EngineClient } from "./EngineClient.js";
import type { EngineSelection } from "./chooseBuild.js";

export type EngineContextValue = {
  opponent: EngineClient | null;
  build: EngineSelection | null;
  initialize: () => Promise<EngineClient>;
};

export const EngineContext = createContext<EngineContextValue | null>(null);
