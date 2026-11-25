// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { englishVoice, unlockReadAloud, useReadAloud } from "./readAloud.js";

const voice = (lang: string, localService: boolean) =>
  ({
    lang,
    localService,
    name: lang,
    voiceURI: lang,
    default: false,
  }) satisfies SpeechSynthesisVoice;

afterEach(() => vi.unstubAllGlobals());

it("prefers a local English voice and replaces a message as soon as a new one arrives", () => {
  const local = voice("en-GB", true);
  const voices = [voice("fr-FR", true), voice("en-US", false), local];
  expect(englishVoice(voices)).toEqual(local);
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      readonly text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  vi.stubGlobal("speechSynthesis", {
    speak,
    cancel,
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  unlockReadAloud();
  expect(speak).toHaveBeenLastCalledWith(
    expect.objectContaining({ volume: 0 }),
  );
  const { result, rerender } = renderHook(
    ({ text, enabled }) => useReadAloud(enabled, text),
    { initialProps: { text: "Take another look.", enabled: true } },
  );
  expect(result.current).toBe(true);
  expect(speak).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: "Take another look.",
      voice: local,
      rate: 0.95,
      pitch: 1.1,
    }),
  );
  cancel.mockClear();
  rerender({ text: "Nice work.", enabled: true });
  expect(cancel).toHaveBeenCalled();
  expect(speak).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "Nice work." }),
  );
  rerender({ text: "Quiet, please.", enabled: false });
  expect(speak).toHaveBeenCalledTimes(3);
});

it("reports that speech is unavailable when there is no English voice", () => {
  const speak = vi.fn();
  vi.stubGlobal("speechSynthesis", {
    speak,
    getVoices: () => [voice("fr-FR", true)],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const { result } = renderHook(() => useReadAloud(true, "A message."));
  expect(result.current).toBe(false);
  expect(speak).not.toHaveBeenCalled();
});
