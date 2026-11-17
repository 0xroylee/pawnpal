import {
  createEngineClient,
  type EngineClient,
  type EngineClientOptions,
} from "./EngineClient.js";
import { WorkerTransport } from "./transport.js";

export type EngineBuild = {
  scriptUrl: string;
  threads: number;
  name: "lite" | "lite-single";
};
export type EngineFactory = (build: EngineBuild) => EngineClient;

export function createEngines(
  build: EngineBuild,
  factory: EngineFactory = (selectedBuild) => {
    const transport = new WorkerTransport(selectedBuild.scriptUrl);
    const options: EngineClientOptions = { threads: selectedBuild.threads };
    return createEngineClient(transport, options);
  },
): { opponent: () => EngineClient; analyst: () => EngineClient } {
  let opponent: EngineClient | undefined;
  let analyst: EngineClient | undefined;
  const analystBuild = {
    ...build,
    threads: Math.max(1, Math.floor(build.threads / 2)),
  };
  return {
    opponent: () => (opponent ??= factory(build)),
    analyst: () => (analyst ??= factory(analystBuild)),
  };
}
