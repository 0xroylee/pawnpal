// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EngineClient } from "./EngineClient.js";
import { EngineProvider } from "./EngineProvider.js";
import { useEngine } from "./useEngine.js";

describe("EngineProvider", () => {
  it("creates and initializes the opponent only when a game starts", async () => {
    const engine = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi.fn(() => engine);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result, unmount } = renderHook(() => useEngine(), { wrapper });

    expect(createEngine).not.toHaveBeenCalled();
    expect(result.current.opponent).toBeNull();
    await act(async () => {
      await result.current.initialize();
    });

    expect(createEngine).toHaveBeenCalledOnce();
    expect(engine.init).toHaveBeenCalledOnce();
    expect(result.current.opponent).toBe(engine);
    expect(result.current.build?.name).toBe("lite-single");
    unmount();
    expect(engine.terminate).toHaveBeenCalledOnce();
  });
});
