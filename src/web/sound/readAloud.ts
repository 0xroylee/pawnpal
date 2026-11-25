import { useEffect, useState } from "react";

export function englishVoice(voices: readonly SpeechSynthesisVoice[]) {
  const english = voices.filter(({ lang }) => /^en(?:-|$)/i.test(lang));
  return english.find(({ localService }) => localService) ?? english[0];
}

function speak(
  voice: SpeechSynthesisVoice | undefined,
  text: string,
  volume = 1,
) {
  if (typeof SpeechSynthesisUtterance !== "function" || !window.speechSynthesis)
    return;
  const reader = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en";
  utterance.rate = 0.95;
  utterance.pitch = 1.1;
  utterance.volume = volume;
  reader.cancel();
  reader.speak(utterance);
  return () => reader.cancel();
}

export function unlockReadAloud() {
  const voice = englishVoice(window.speechSynthesis?.getVoices() ?? []);
  speak(voice, "Pip", 0);
}

export function useReadAloud(enabled: boolean, text?: string) {
  const [voice, setVoice] = useState(() =>
    englishVoice(window.speechSynthesis?.getVoices() ?? []),
  );
  useEffect(() => {
    const reader = window.speechSynthesis;
    const refresh = () => setVoice(englishVoice(reader?.getVoices() ?? []));
    reader?.addEventListener("voiceschanged", refresh);
    return () => reader?.removeEventListener("voiceschanged", refresh);
  }, []);
  useEffect(() => {
    if (enabled && voice && text) return speak(voice, text);
  }, [enabled, text, voice]);
  return Boolean(voice);
}
