import { Hono } from "hono";
import { CoachBrain } from "../llm/brain.ts";
import { ParentGate } from "../parent/gate.ts";
import { installParentRoutes, jsonBody as body } from "../parent/routes.ts";
import type { NetworkMode } from "../network.ts";
import { LibraryFault } from "./fault.ts";
import type { Library } from "./library.ts";
import {
  listGamesSchema,
  preferencesSchema,
  profilePatchSchema,
  profileSchema,
  saveGameSchema,
  startGameSchema,
  suggestionResponseSchema,
} from "./schemas.ts";

export function libraryRoutes(
  library: Library,
  dependencies: {
    fetch?: typeof globalThis.fetch;
    now?: () => number;
    network?: NetworkMode;
  } = {},
) {
  const api = new Hono();
  const gate = new ParentGate(library, dependencies.now);
  const brain = new CoachBrain(library, dependencies.fetch);
  api.onError((error, context) => {
    if (error instanceof LibraryFault)
      return context.json({ error: error.message }, error.status);
    throw error;
  });
  api.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  api.get("/profiles", (context) => context.json(library.listProfiles()));
  api.post("/profiles", async (context) => {
    gate.require(context);
    return context.json(
      library.createProfile(await body(context, profileSchema)),
      201,
    );
  });
  api.patch("/profiles/:id", async (context) => {
    gate.require(context);
    return context.json(
      library.updateProfile(
        context.req.param("id"),
        await body(context, profilePatchSchema),
      ),
    );
  });
  api.patch("/profiles/:id/preferences", async (context) =>
    context.json(
      library.updateProfile(
        context.req.param("id"),
        await body(context, preferencesSchema),
      ),
    ),
  );
  api.delete("/profiles/:id", (context) => {
    gate.require(context);
    library.deleteProfile(context.req.param("id"));
    return context.body(null, 204);
  });

  api.post("/games", async (context) => {
    const { profileId, state, replaceActiveGameId } = await body(
      context,
      startGameSchema,
    );
    return context.json(
      library.startGame(profileId, state, replaceActiveGameId),
      201,
    );
  });
  api.get("/games/:id", (context) =>
    context.json(library.getGame(context.req.param("id"))),
  );
  api.put("/games/:id", async (context) => {
    const { state, revision } = await body(context, saveGameSchema);
    if (state.result)
      throw new LibraryFault(400, "Use the finish route for a completed game");
    return context.json(
      library.saveGame(context.req.param("id"), revision, state),
    );
  });
  api.post("/games/:id/finish", async (context) => {
    const { state, revision } = await body(context, saveGameSchema);
    if (!state.result) throw new LibraryFault(400, "Expected a finished game");
    return context.json(
      library.saveGame(context.req.param("id"), revision, state),
    );
  });
  api.get("/profiles/:id/games", (context) => {
    const query = listGamesSchema.safeParse(context.req.query());
    if (!query.success) throw new LibraryFault(400, "Invalid game pagination");
    return context.json(
      library.listGames(
        context.req.param("id"),
        query.data.limit,
        query.data.cursor,
      ),
    );
  });
  api.get("/profiles/:id/stats", (context) =>
    context.json(library.stats(context.req.param("id"))),
  );
  api.get("/profiles/:id/badges", (context) =>
    context.json(library.badges(context.req.param("id"))),
  );
  api.get("/profiles/:id/export", (context) => {
    gate.require(context);
    return context.body(library.exportGames(context.req.param("id")), 200, {
      "Content-Type": "application/x-chess-pgn; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pawnpal-games.pgn"',
    });
  });
  api.get("/profiles/:id/suggestion", (context) =>
    context.json(library.getSuggestion(context.req.param("id"))),
  );
  api.post("/profiles/:id/suggestion", async (context) => {
    const { id, response } = await body(context, suggestionResponseSchema);
    return context.json(
      library.respondToSuggestion(context.req.param("id"), id, response),
    );
  });
  installParentRoutes(api, library, gate, brain, dependencies.network);
  return api;
}
