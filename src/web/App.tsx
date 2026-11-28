import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Color } from "chess.js";
import {
  defaultDifficulty,
  isDifficulty,
  type Difficulty,
} from "../shared/game/difficulty.js";
import type { Profile, SavedGame } from "../shared/game/library.js";
import { EngineProvider } from "./engine/EngineProvider.js";
import { useEngine } from "./engine/useEngine.js";
import { useGrading } from "./game/useGrading.js";
import { useOpponent } from "./game/useOpponent.js";
import { gameReducer, initialGame } from "./game/reducer.js";
import { createGameSaver, type SaveStatus } from "./game/autosave.js";
import { library } from "./game/libraryClient.js";
import { parseStartParams } from "./dev/startParams.js";
import { replayAnalystFactory } from "./dev/replayAnalyst.js";
import {
  createSounds,
  selectMoveSound,
  soundStorageKey,
  type AudioContextLike,
} from "./sound/sounds.js";
import { GameScreen } from "./screens/GameScreen.js";
import { ReviewScreen } from "./screens/ReviewScreen.js";
import type { GameState } from "../shared/game/types.js";
import { starsForGame } from "../shared/game/rewards.js";
import { unlockReadAloud } from "./sound/readAloud.js";
import {
  ProfileCard,
  ProfileHistory,
  ProfilePicker,
} from "./screens/ProfileScreens.js";
import { useSetupInfo } from "./screens/useSetupInfo.js";
import { Pip } from "./screens/Pip.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { t } from "./i18n/t.js";
import { ParentScreen } from "./parent/ParentScreen.js";
import {
  coachApi,
  localNetwork,
  parent,
  type BrainStatus,
} from "./parent/client.js";

const guestLevelKey = "pawnpal.level";
const guestVoiceKey = "pawnpal.voiceOn";

function storedSetting(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function App() {
  return (
    <EngineProvider>
      <AppContent />
    </EngineProvider>
  );
}

function AppContent() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGame);
  const {
    opponent: engine,
    analyst,
    build: engineBuild,
    initialize,
  } = useEngine();
  const starting = useRef(false);
  const [startingGame, setStartingGame] = useState(false);
  const [dev, setDev] = useState(false);
  const [menu, setMenu] = useState<
    "picker" | "parent" | "continue" | "setup" | "history" | "about"
  >("picker");
  const [profiles, setProfiles] = useState<Profile[]>();
  const [profile, setProfile] = useState<Profile>();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brain, setBrain] = useState<BrainStatus>();
  const [networkOn, setNetworkOn] = useState(false);
  const [review, setReview] = useState<{
    state: GameState;
    stars?: number | null;
  }>();
  const [lastSave, setLastSave] = useState<SavedGame>();
  const [guestVoice, setGuestVoice] = useState(
    () => storedSetting(guestVoiceKey) === "true",
  );
  const [failed, setFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>();
  const saver = useRef<ReturnType<typeof createGameSaver> | null>(null);
  const soundWrites = useRef(Promise.resolve());
  const soundChange = useRef(0);
  const voiceChange = useRef(0);
  const voiceOn = profile?.voiceOn ?? guestVoice;
  const sounds = useMemo(
    () =>
      createSounds({
        audio:
          typeof window.AudioContext === "function"
            ? () => new window.AudioContext() as unknown as AudioContextLike
            : undefined,
        storage: window.localStorage,
      }),
    [],
  );
  const [muted, setMuted] = useState(sounds.muted);
  const previousMoveCount = useRef(0);
  const previousResult = useRef(false);

  useEffect(() => sounds.subscribe(setMuted), [sounds]);
  useEffect(() => {
    const latestMove = state.history.at(-1);
    const newMove = state.history.length > previousMoveCount.current;
    previousMoveCount.current = state.history.length;
    if (latestMove && newMove) {
      sounds.play(
        selectMoveSound({
          isGameOver: Boolean(state.result),
          givesCheck: Boolean(state.checkSquare),
          isCapture: latestMove.san.includes("x"),
        }),
      );
    }
    const hasResult = Boolean(state.result);
    if (hasResult && !previousResult.current && !newMove) sounds.play("end");
    previousResult.current = hasResult;
  }, [sounds, state.checkSquare, state.history, state.result]);
  useEffect(() => {
    if (state.phase !== "setup") saver.current?.enqueue(state);
  }, [state]);

  const perform = useCallback(async (work: () => Promise<void>) => {
    if (starting.current) return;
    starting.current = true;
    setStartingGame(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      starting.current = false;
      setStartingGame(false);
    }
  }, []);

  const attach = useCallback((game: SavedGame) => {
    setLastSave(game);
    saver.current = createGameSaver(game, setSaveStatus, setLastSave);
    setSaveStatus("saved");
    previousMoveCount.current = game.state.history.length;
    previousResult.current = Boolean(game.state.result);
    dispatch({ type: "RESTORE_GAME", saved: game.state });
  }, []);

  const startGame = useCallback(
    ({
      kidColor,
      fen,
      analyst,
      offerTryAgain,
      player,
      level = defaultDifficulty,
    }: {
      kidColor: Color | "random";
      fen?: string;
      analyst?: "replay";
      offerTryAgain?: boolean;
      player?: Profile;
      level?: Difficulty;
    }) =>
      perform(async () => {
        await initialize(
          analyst === "replay"
            ? { analyst: replayAnalystFactory() }
            : undefined,
        );
        const action = {
          type: "NEW_GAME",
          kidColor,
          fen,
          offerTryAgain,
          level,
        } as const;
        if (!player) {
          if (fen === undefined) {
            try {
              window.localStorage.setItem(guestLevelKey, String(level));
            } catch {
              /* The game can still start without storing the choice. */
            }
          }
          dispatch(action);
          return;
        }
        const newGame = gameReducer(initialGame(), action);
        const game = await library.startGame(
          player.id,
          newGame,
          player.activeGameId ?? undefined,
        );
        setProfile((current) =>
          current?.id === player.id
            ? { ...current, level: game.level }
            : current,
        );
        attach(game);
      }),
    [attach, initialize, perform],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then((response) => response.json() as Promise<{ dev?: boolean }>)
      .then(async (health) => {
        if (cancelled) return;
        setDev(health.dev === true);
        const startParams = parseStartParams(
          window.location.search,
          health.dev === true,
        );
        if (startParams) {
          await startGame({
            kidColor: startParams.color,
            fen: startParams.fen,
            analyst: startParams.analyst,
            offerTryAgain: startParams.offerTryAgain,
            level: startParams.level,
          });
          return;
        }
        const [profiles, status] = await Promise.all([
          library.listProfiles(),
          parent.status(),
        ]);
        if (!cancelled) {
          setProfiles(profiles);
          setNeedsSetup(status.setup);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    void coachApi
      .status()
      .then((status) => {
        if (!cancelled) setBrain(status);
      })
      .catch(() => undefined);
    void localNetwork()
      .then(({ showBanner }) => {
        if (!cancelled) setNetworkOn(showBanner);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [startGame]);

  const selectedId = state.phase === "setup" ? profile?.id : undefined;
  const { suggestion, beatenLevels, suggestionAnswered } = useSetupInfo(
    selectedId,
    library,
  );

  useOpponent(state, dispatch, {
    engine,
  });
  useGrading(state, dispatch, { analyst });

  const selectProfile = (chosen: Profile) => {
    soundChange.current++;
    setProfile(chosen);
    sounds.setMuted(!chosen.soundOn, { persist: false });
    setFailed(false);
    setMenu(chosen.activeGameId ? "continue" : "setup");
  };
  const selectGuest = () => {
    soundChange.current++;
    sounds.setMuted(storedSetting(soundStorageKey) === "true", {
      persist: false,
    });
    setProfile(undefined);
    setFailed(false);
    setMenu("setup");
  };
  const picker = () => {
    soundChange.current++;
    setProfile(undefined);
    setFailed(false);
    setMenu("picker");
    void Promise.all([library.listProfiles(), parent.status()])
      .then(([profiles, status]) => {
        setProfiles(profiles);
        setNeedsSetup(status.setup);
      })
      .catch(() => setFailed(true));
    void coachApi
      .status()
      .then(setBrain)
      .catch(() => undefined);
    void localNetwork()
      .then(({ showBanner }) => setNetworkOn(showBanner))
      .catch(() => undefined);
  };
  const answerSuggestion = (response: "accepted" | "declined") => {
    if (!profile || !suggestion) return;
    void perform(async () => {
      const updated = await library.respond(
        profile.id,
        suggestion.id,
        response,
      );
      setProfile(updated);
      suggestionAnswered();
    });
  };
  const resume = () => {
    if (!profile?.activeGameId) return;
    if (voiceOn) unlockReadAloud();
    void perform(async () => {
      const game = await library.getGame(profile.activeGameId!);
      if (game.status !== "active") throw new Error("Game no longer active");
      await initialize();
      attach(game);
    });
  };
  const leaveGame = (destination: "home" | "playAgain" | "review") => {
    void perform(async () => {
      const writer = saver.current;
      if (writer) {
        writer.enqueue(state);
        if (!(await writer.flush())) return;
      }
      saver.current = null;
      setSaveStatus(undefined);
      setLastSave(undefined);
      dispatch({ type: "PLAY_AGAIN" });
      if (destination === "review") {
        setReview({ state, stars: starsForGame(state) });
      } else if (destination === "home") {
        picker();
      } else {
        setProfile((current) => current && { ...current, activeGameId: null });
        setMenu("setup");
      }
    });
  };
  const toggleSound = () => {
    const nextMuted = !sounds.muted;
    sounds.setMuted(nextMuted, { persist: !profile });
    if (profile) {
      const change = ++soundChange.current;
      soundWrites.current = soundWrites.current.then(async () => {
        try {
          await library.preferences(profile.id, { soundOn: !nextMuted });
        } catch {
          if (soundChange.current === change) {
            sounds.setMuted(!nextMuted, { persist: false });
          }
        }
      });
    }
  };
  const toggleVoice = () => {
    const enabled = !voiceOn;
    if (enabled) unlockReadAloud();
    if (!profile) {
      setGuestVoice(enabled);
      try {
        window.localStorage.setItem(guestVoiceKey, String(enabled));
      } catch {
        /* The toggle still takes effect. */
      }
      return;
    }
    const { id } = profile;
    const change = ++voiceChange.current;
    setProfile({ ...profile, voiceOn: enabled });
    soundWrites.current = soundWrites.current.then(async () => {
      try {
        await library.preferences(id, { voiceOn: enabled });
      } catch {
        if (voiceChange.current === change)
          setProfile((current) =>
            current?.id === id ? { ...current, voiceOn } : current,
          );
      }
    });
  };

  if (review) {
    return (
      <ReviewScreen
        state={review.state}
        stars={review.stars}
        brain={brain}
        kidAge={profile?.age}
        voiceOn={voiceOn}
        onToggleVoice={toggleVoice}
        onDone={() => {
          setReview(undefined);
          picker();
        }}
      />
    );
  }
  if (state.phase === "setup") {
    const navigation = (
      <div className="pp-library__actions">
        <button
          className="pp-btn pp-btn--ghost pp-btn--sm"
          type="button"
          onClick={picker}
          disabled={startingGame}
        >
          {t("library.back")}
        </button>
        {profile && (
          <button
            className="pp-btn pp-btn--ghost pp-btn--sm"
            type="button"
            onClick={() => setMenu("history")}
            disabled={startingGame}
          >
            {t("library.history")}
          </button>
        )}
      </div>
    );
    const levelPrompt = profile && suggestion && (
      <div className="pp-suggest">
        <Pip mood="cheering" />
        <p>
          {t(
            suggestion.direction === "up"
              ? "library.levelUp"
              : "library.levelDown",
            { level: suggestion.level },
          )}
        </p>
        <div className="pp-library__actions">
          {(["accepted", "declined"] as const).map((response) => (
            <button
              key={response}
              className="pp-btn pp-btn--secondary pp-btn--sm"
              type="button"
              disabled={startingGame}
              onClick={() => answerSuggestion(response)}
            >
              {t(
                response === "accepted" ? "library.accept" : "library.decline",
              )}
            </button>
          ))}
        </div>
      </div>
    );
    const error = failed && <p role="alert">{t("library.error")}</p>;

    if (menu === "about")
      return (
        <ProfileCard>
          <h1>{t("about.title")}</h1>
          <p>{t("about.stockfish")}</p>
          <p>{t("about.horsey")}</p>
          <a href="/licenses/horsey/LICENSE.md">{t("about.artLicense")}</a>
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={picker}
          >
            {t("library.back")}
          </button>
        </ProfileCard>
      );
    if (menu === "parent" || (menu === "picker" && needsSetup)) {
      const wizard = menu === "picker";
      const level = Number(storedSetting(guestLevelKey));
      return (
        <ParentScreen
          key={wizard ? "wizard" : "parent"}
          wizard={wizard}
          legacyLevel={isDifficulty(level) ? level : undefined}
          guestSoundOn={storedSetting(soundStorageKey) !== "true"}
          onGuest={selectGuest}
          onDone={() => {
            setNeedsSetup(false);
            picker();
          }}
        />
      );
    }
    if (menu === "history" && profile) {
      return (
        <ProfileHistory
          profile={profile}
          onBack={() => setMenu(profile.activeGameId ? "continue" : "setup")}
          onReview={async (id) => {
            if (voiceOn) unlockReadAloud();
            const { state, stars } = await library.getGame(id);
            setReview({ state, stars });
          }}
        />
      );
    }
    if (menu === "continue" && profile) {
      return (
        <main className="pp-app pp-hero">
          <Pip mood="happy" className="pp-hero__pip" />
          <h1>{t("library.continueTitle")}</h1>
          {levelPrompt}
          <div className="pp-library__actions">
            <button
              className="pp-btn pp-btn--primary"
              type="button"
              onClick={resume}
              disabled={startingGame}
            >
              {t("library.continue")}
            </button>
            <button
              className="pp-btn pp-btn--secondary"
              type="button"
              onClick={() => setMenu("setup")}
              disabled={startingGame}
            >
              {t("library.newGame")}
            </button>
          </div>
          {error}
          {navigation}
        </main>
      );
    }
    if (menu === "setup") {
      const preferredLevel =
        profile?.level ?? Number(storedSetting(guestLevelKey));
      const level = isDifficulty(preferredLevel)
        ? preferredLevel
        : defaultDifficulty;
      return (
        <SetupScreen
          key={level}
          initialLevel={level}
          onStart={(options) => {
            if (voiceOn) unlockReadAloud();
            void startGame({ ...options, player: profile });
          }}
          disabled={startingGame}
          beatenLevels={beatenLevels}
          suggestion={suggestion}
          onSuggestion={answerSuggestion}
        >
          {error}
          {navigation}
        </SetupScreen>
      );
    }
    if (profiles) {
      return (
        <ProfilePicker
          profiles={profiles}
          onSelect={selectProfile}
          onCreate={() => setMenu("parent")}
          onParent={() => setMenu("parent")}
          networkOn={networkOn}
          onAbout={() => setMenu("about")}
          onGuest={selectGuest}
        />
      );
    }
    return (
      <ProfileCard>
        {failed ? (
          <>
            {error}
            <button
              className="pp-btn pp-btn--secondary"
              type="button"
              onClick={picker}
            >
              {t("library.retry")}
            </button>
            <button
              className="pp-btn pp-btn--ghost"
              type="button"
              onClick={selectGuest}
            >
              {t("library.guest")}
            </button>
          </>
        ) : (
          <p role="status">{t("library.loading")}</p>
        )}
      </ProfileCard>
    );
  }
  return (
    <GameScreen
      state={state}
      dispatch={dispatch}
      muted={muted}
      onToggleSound={toggleSound}
      onLeave={leaveGame}
      onReview={() => leaveGame("review")}
      brain={brain}
      kidAge={profile?.age}
      voiceOn={voiceOn}
      onToggleVoice={toggleVoice}
      stars={profile ? lastSave?.stars : starsForGame(state)}
      newBadges={lastSave?.newBadges}
      saveStatus={saveStatus}
      onRetrySave={() => void saver.current?.flush()}
      engineBuild={engineBuild?.name}
      dev={dev}
    />
  );
}
