import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { chooseBuild, type EngineSelection } from "./chooseBuild.js";
import type { EngineClient } from "./EngineClient.js";
import { createEngines, type EngineFactory } from "./engines.js";
import { EngineContext } from "./engineContext.js";

export function EngineProvider({
  children,
  engineFactory,
}: {
  children: ReactNode;
  engineFactory?: EngineFactory;
}) {
  const engineRef = useRef<EngineClient | null>(null);
  const analystRef = useRef<EngineClient | null>(null);
  const initialization = useRef<Promise<EngineClient> | null>(null);
  const [opponent, setOpponent] = useState<EngineClient | null>(null);
  const [analyst, setAnalyst] = useState<EngineClient | null>(null);
  const [build, setBuild] = useState<EngineSelection | null>(null);

  const initialize = useCallback(() => {
    if (initialization.current) return initialization.current;
    if (engineRef.current) return Promise.resolve(engineRef.current);

    const pending = (async () => {
      const selection = chooseBuild({
        crossOriginIsolated: globalThis.crossOriginIsolated === true,
        hardwareConcurrency:
          typeof navigator === "undefined"
            ? 1
            : navigator.hardwareConcurrency || 1,
      });
      const engines = createEngines(selection, engineFactory);
      const client = engines.opponent();
      let analystClient: EngineClient | null = null;
      let analystCreationError: unknown;
      try {
        analystClient = engines.analyst();
      } catch (error) {
        analystCreationError = error;
      }
      engineRef.current = client;
      analystRef.current = analystClient;

      const [opponentResult, analystResult] = await Promise.allSettled([
        client.init(),
        analystClient
          ? analystClient.init()
          : Promise.reject(analystCreationError),
      ]);
      if (opponentResult.status === "rejected") {
        engineRef.current = null;
        analystRef.current = null;
        client.terminate();
        analystClient?.terminate();
        throw opponentResult.reason;
      }

      setBuild(selection);
      setOpponent(client);
      if (analystClient && analystResult.status === "fulfilled") {
        setAnalyst(analystClient);
      } else {
        const analystError =
          analystResult.status === "rejected"
            ? analystResult.reason
            : analystCreationError;
        console.error(
          analystClient
            ? "Analyst engine failed to initialize"
            : "Analyst engine failed to create",
          analystError,
        );
        analystClient?.terminate();
        analystRef.current = null;
        setAnalyst(null);
      }
      return client;
    })();
    initialization.current = pending;
    const clearPending = () => {
      if (initialization.current === pending) initialization.current = null;
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }, [engineFactory]);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      analystRef.current?.terminate();
    },
    [],
  );

  const value = useMemo(
    () => ({ opponent, analyst, build, initialize }),
    [opponent, analyst, build, initialize],
  );
  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
}
