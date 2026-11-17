import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Color } from "chess.js";
import { EngineProvider } from "./engine/EngineProvider.js";
import { useEngine } from "./engine/useEngine.js";
import { useGrading } from "./game/useGrading.js";
import { useOpponent } from "./game/useOpponent.js";
import { gameReducer, initialGame } from "./game/reducer.js";
import { parseStartParams } from "./dev/startParams.js";
import {
  createSounds,
  selectMoveSound,
  type AudioContextLike,
} from "./sound/sounds.js";
import { GameScreen } from "./screens/GameScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";

const idleEngine = {
  newGame: async () => undefined,
  setOptions: async () => undefined,
  bestMove: async () => "",
};

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
  const lastPlayedMove = useRef<string | null>(null);
  const previousResult = useRef(false);

  useEffect(() => sounds.subscribe(setMuted), [sounds]);
  useEffect(() => {
    const latestMove = state.history.at(-1);
    let newMove = false;
    if (!latestMove) {
      lastPlayedMove.current = null;
    } else if (latestMove.uci !== lastPlayedMove.current) {
      newMove = true;
      lastPlayedMove.current = latestMove.uci;
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
  const startGame = useCallback(
    async ({ kidColor, fen }: { kidColor: Color | "random"; fen?: string }) => {
      if (starting.current) return;
      starting.current = true;
      setStartingGame(true);
      try {
        await initialize();
        dispatch({ type: "NEW_GAME", kidColor, ...(fen ? { fen } : {}) });
      } finally {
        starting.current = false;
        setStartingGame(false);
      }
    },
    [initialize],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then((response) => response.json() as Promise<{ dev?: boolean }>)
      .then((health) => {
        if (cancelled) return;
        setDev(health.dev === true);
        const startParams = parseStartParams(
          window.location.search,
          health.dev === true,
        );
        if (startParams)
          void startGame({ kidColor: startParams.color, fen: startParams.fen });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [startGame]);

  useOpponent(state, dispatch, {
    engine: engine ?? idleEngine,
  });
  useGrading(state, dispatch, { analyst });

  if (state.phase === "setup") {
    return <SetupScreen onStart={startGame} disabled={startingGame} />;
  }
  return (
    <GameScreen
      state={state}
      dispatch={dispatch}
      muted={muted}
      onToggleSound={() => sounds.setMuted(!sounds.muted)}
      engineBuild={engineBuild?.name}
      dev={dev}
    />
  );
}
