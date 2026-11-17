export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type AudioParamLike = {
  setValueAtTime: (value: number, time: number) => void;
  exponentialRampToValueAtTime: (value: number, time: number) => void;
};
type AudioNodeLike = { connect: (destination: unknown) => void };
type OscillatorLike = AudioNodeLike & {
  type: OscillatorType | string;
  frequency: { value: number };
  start: (time?: number) => void;
  stop: (time?: number) => void;
};
type GainLike = AudioNodeLike & { gain: AudioParamLike };
export type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createOscillator: () => OscillatorLike;
  createGain: () => GainLike;
  resume?: () => Promise<void>;
};

export type SoundKind = "move" | "capture" | "check" | "end";
export type MoveSoundContext = {
  isGameOver: boolean;
  givesCheck: boolean;
  isCapture: boolean;
};
export type Sounds = {
  readonly muted: boolean;
  play: (kind: SoundKind) => void;
  setMuted: (muted: boolean) => void;
  subscribe: (listener: (muted: boolean) => void) => () => void;
};

const storageKey = "pawnpal.soundMuted";
const notes: Record<
  SoundKind,
  Array<{ hz: number; durationMs: number; offsetMs: number }>
> = {
  move: [{ hz: 440, durationMs: 80, offsetMs: 0 }],
  capture: [
    { hz: 440, durationMs: 60, offsetMs: 0 },
    { hz: 660, durationMs: 90, offsetMs: 50 },
  ],
  check: [{ hz: 740, durationMs: 110, offsetMs: 0 }],
  end: [
    { hz: 523, durationMs: 110, offsetMs: 0 },
    { hz: 659, durationMs: 110, offsetMs: 100 },
    { hz: 784, durationMs: 170, offsetMs: 200 },
  ],
};

export function selectMoveSound({
  isGameOver,
  givesCheck,
  isCapture,
}: MoveSoundContext): SoundKind {
  if (isGameOver) return "end";
  if (givesCheck) return "check";
  if (isCapture) return "capture";
  return "move";
}

export function createSounds({
  audio,
  storage,
}: {
  audio?: () => AudioContextLike;
  storage: StorageLike;
}): Sounds {
  let muted = false;
  let context: AudioContextLike | undefined;
  const listeners = new Set<(muted: boolean) => void>();
  try {
    muted = storage.getItem(storageKey) === "true";
  } catch {
    muted = false;
  }

  const play = (kind: SoundKind) => {
    if (muted || !audio) return;
    try {
      context ??= audio();
      void context.resume?.().catch(() => undefined);
      const now = context.currentTime;
      for (const note of notes[kind]) {
        const start = now + note.offsetMs / 1000;
        const end = start + note.durationMs / 1000;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = note.hz;
        gain.gain.setValueAtTime(0.14, start);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end);
      }
    } catch {
      // Audio is an enhancement; unavailable devices or autoplay policy stay silent.
    }
  };

  return {
    get muted() {
      return muted;
    },
    play,
    setMuted(value) {
      if (muted === value) return;
      muted = value;
      try {
        storage.setItem(storageKey, String(value));
      } catch {
        // Keep the in-memory setting even when persistent storage is unavailable.
      }
      listeners.forEach((listener) => listener(muted));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
