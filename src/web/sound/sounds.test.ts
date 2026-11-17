import { describe, expect, it, vi } from "vitest";
import {
  createSounds,
  selectMoveSound,
  type AudioContextLike,
  type StorageLike,
} from "./sounds.js";

function fakeAudio() {
  const oscillators: Array<{
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const context: AudioContextLike = {
    currentTime: 2,
    destination: {},
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
    createOscillator: () => {
      const oscillator = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
  };
  return { audio: () => context, oscillators };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("createSounds", () => {
  it("creates a short sine tone for a move", () => {
    const fake = fakeAudio();
    const sounds = createSounds({
      audio: fake.audio,
      storage: memoryStorage(),
    });
    sounds.play("move");

    expect(fake.oscillators).toHaveLength(1);
    expect(fake.oscillators[0].type).toBe("sine");
    expect(fake.oscillators[0].stop).toHaveBeenCalledWith(2.08);
  });

  it("does not create audio while muted and persists the setting", () => {
    const fake = fakeAudio();
    const storage = memoryStorage();
    const sounds = createSounds({ audio: fake.audio, storage });
    sounds.setMuted(true);
    sounds.play("capture");

    expect(fake.oscillators).toHaveLength(0);
    expect(sounds.muted).toBe(true);
    expect(storage.getItem("pawnpal.soundMuted")).toBe("true");
  });

  it("does not throw when no audio factory is available", () => {
    const sounds = createSounds({ storage: memoryStorage() });
    expect(() => sounds.play("end")).not.toThrow();
  });

  it("notifies subscribers when the mute state changes", () => {
    const sounds = createSounds({ storage: memoryStorage() });
    const listener = vi.fn();
    const unsubscribe = sounds.subscribe(listener);
    sounds.setMuted(true);
    unsubscribe();
    sounds.setMuted(false);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("selectMoveSound", () => {
  it("selects the normal move, capture, check, and game-end sounds", () => {
    expect(
      selectMoveSound({
        isGameOver: false,
        givesCheck: false,
        isCapture: false,
      }),
    ).toBe("move");
    expect(
      selectMoveSound({
        isGameOver: false,
        givesCheck: false,
        isCapture: true,
      }),
    ).toBe("capture");
    expect(
      selectMoveSound({
        isGameOver: false,
        givesCheck: true,
        isCapture: false,
      }),
    ).toBe("check");
    expect(
      selectMoveSound({
        isGameOver: true,
        givesCheck: true,
        isCapture: true,
      }),
    ).toBe("end");
  });
});
