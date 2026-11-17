import engineFiles from "./engine-files.json";

export type EngineSelection = {
  scriptUrl: string;
  wasmUrl: string;
  threads: number;
  name: "lite" | "lite-single";
};

export function chooseBuild({
  crossOriginIsolated,
  hardwareConcurrency,
}: {
  crossOriginIsolated: boolean;
  hardwareConcurrency: number;
}): EngineSelection {
  const useMultiThreaded = crossOriginIsolated && hardwareConcurrency > 1;
  const name = useMultiThreaded ? "lite" : "lite-single";
  const file = engineFiles[name];
  return {
    scriptUrl: `/engine/bin/${file.js}`,
    wasmUrl: `/engine/bin/${file.wasm}`,
    threads: useMultiThreaded ? Math.max(1, hardwareConcurrency - 1) : 1,
    name,
  };
}
