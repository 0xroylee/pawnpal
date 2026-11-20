import type { EngineClient } from "../engine/EngineClient.js";
import { createEngineClient } from "../engine/EngineClient.js";
import {
  createReplayTransport,
  type ReplayRecording,
} from "../engine/replayTransport.js";

declare global {
  var __pawnpalReplay: ReplayRecording | undefined;
}

export function replayAnalystFactory(): () => EngineClient {
  return () => {
    const recording = globalThis.__pawnpalReplay;
    if (!recording) throw new Error("Replay recording missing");
    return createEngineClient(createReplayTransport(recording), {
      threads: 1,
    });
  };
}
