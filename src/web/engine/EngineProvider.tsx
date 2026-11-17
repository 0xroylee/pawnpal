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
  const initialization = useRef<Promise<EngineClient> | null>(null);
  const [opponent, setOpponent] = useState<EngineClient | null>(null);
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
      const client = engineFactory
        ? engineFactory(selection)
        : createEngines(selection).opponent();
      engineRef.current = client;
      try {
        await client.init();
        setBuild(selection);
        setOpponent(client);
        return client;
      } catch (error) {
        engineRef.current = null;
        client.terminate();
        throw error;
      }
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
    },
    [],
  );

  const value = useMemo(
    () => ({ opponent, build, initialize }),
    [opponent, build, initialize],
  );
  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
}
