import { useContext } from "react";
import { EngineContext } from "./engineContext.js";

export function useEngine() {
  const value = useContext(EngineContext);
  if (!value) throw new Error("useEngine must be used inside EngineProvider");
  return value;
}
