// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EngineClient } from "./EngineClient.js";
import { EngineProvider } from "./EngineProvider.js";
import { useEngine } from "./useEngine.js";

describe("EngineProvider", () => {
  it("creates and initializes both engines only when a game starts", async () => {
    const opponent = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const analyst = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi
      .fn()
      .mockReturnValueOnce(opponent)
      .mockReturnValueOnce(analyst);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result, unmount } = renderHook(() => useEngine(), { wrapper });

    expect(createEngine).not.toHaveBeenCalled();
    expect(result.current.opponent).toBeNull();
    expect(result.current.analyst).toBeNull();
    await act(async () => {
      await result.current.initialize();
    });

    expect(createEngine).toHaveBeenCalledTimes(2);
    expect(opponent.init).toHaveBeenCalledOnce();
    expect(analyst.init).toHaveBeenCalledOnce();
    expect(result.current.opponent).toBe(opponent);
    expect(result.current.analyst).toBe(analyst);
    expect(result.current.build?.name).toBe("lite-single");
    unmount();
    expect(opponent.terminate).toHaveBeenCalledOnce();
    expect(analyst.terminate).toHaveBeenCalledOnce();
  });

  it("starts the game when analyst initialization fails", async () => {
    const opponent = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const analyst = {
      init: vi.fn().mockRejectedValue(new Error("analyst unavailable")),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi
      .fn()
      .mockReturnValueOnce(opponent)
      .mockReturnValueOnce(analyst);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result, unmount } = renderHook(() => useEngine(), { wrapper });

    await act(async () => {
      await result.current.initialize();
    });

    expect(result.current.opponent).toBe(opponent);
    expect(result.current.analyst).toBeNull();
    expect(analyst.terminate).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
    unmount();
    log.mockRestore();
  });

  it("starts the game when analyst creation throws synchronously", async () => {
    const opponent = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi
      .fn()
      .mockReturnValueOnce(opponent)
      .mockImplementationOnce(() => {
        throw new Error("analyst worker unavailable");
      });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result, unmount } = renderHook(() => useEngine(), { wrapper });

    await act(async () => {
      await result.current.initialize();
    });

    expect(createEngine).toHaveBeenCalledTimes(2);
    expect(opponent.init).toHaveBeenCalledOnce();
    expect(result.current.opponent).toBe(opponent);
    expect(result.current.analyst).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "Analyst engine failed to create",
      expect.any(Error),
    );
    unmount();
    expect(opponent.terminate).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("uses an analyst override while leaving opponent creation unchanged", async () => {
    const opponent = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const replayAnalyst = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi.fn(() => opponent);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result } = renderHook(() => useEngine(), { wrapper });

    await act(async () => {
      await result.current.initialize({ analyst: () => replayAnalyst });
    });

    expect(createEngine).toHaveBeenCalledOnce();
    expect(opponent.init).toHaveBeenCalledOnce();
    expect(replayAnalyst.init).toHaveBeenCalledOnce();
    expect(result.current.opponent).toBe(opponent);
    expect(result.current.analyst).toBe(replayAnalyst);
  });

  it("logs an analyst override creation error and continues without the analyst", async () => {
    const opponent = {
      init: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as EngineClient;
    const createEngine = vi.fn(() => opponent);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engineFactory={createEngine}>{children}</EngineProvider>
    );
    const { result } = renderHook(() => useEngine(), { wrapper });

    await act(async () => {
      await result.current.initialize({
        analyst: () => {
          throw new Error("Replay recording missing");
        },
      });
    });

    expect(createEngine).toHaveBeenCalledOnce();
    expect(opponent.init).toHaveBeenCalledOnce();
    expect(result.current.opponent).toBe(opponent);
    expect(result.current.analyst).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "Analyst engine failed to create",
      expect.objectContaining({ message: "Replay recording missing" }),
    );
    log.mockRestore();
  });
});
