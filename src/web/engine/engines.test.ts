import { describe, expect, it, vi } from "vitest";
import type { EngineClient } from "./EngineClient.js";
import { createEngines, type EngineBuild } from "./engines.js";

const build: EngineBuild = {
  scriptUrl: "/engine.js",
  threads: 8,
  name: "lite",
};

describe("createEngines", () => {
  it("memoizes the opponent and analyst and assigns the analyst half the threads", () => {
    const clients = [{} as EngineClient, {} as EngineClient];
    const factory = vi.fn(() => clients[factory.mock.calls.length - 1]!);
    const engines = createEngines(build, factory);

    expect(engines.opponent()).toBe(engines.opponent());
    expect(engines.analyst()).toBe(engines.analyst());
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenNthCalledWith(1, build);
    expect(factory).toHaveBeenNthCalledWith(2, { ...build, threads: 4 });
  });

  it("keeps at least one analyst thread for a single-thread build", () => {
    const factory = vi.fn(() => ({}) as EngineClient);
    createEngines({ ...build, threads: 1 }, factory).analyst();
    expect(factory).toHaveBeenCalledWith({ ...build, threads: 1 });
  });
});
