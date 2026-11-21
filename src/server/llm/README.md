# LLM rephrasing core

`client.ts` sends OpenAI-compatible chat requests and lists models. `rephrase.ts` builds the shared prompt, strips thinking blocks, validates the reply, and returns the built-in template when a request or reply fails validation. The prompt builder and validator live in `src/shared/coach/` so inference and training use the same rules. `mockOpenAi.ts` provides an in-process Hono server for tests.

## Deferred integrations

- Spec 06 adds the settings table and `getLlmSettings()` in `src/server/db/`.
- `src/server/routes/coachRephrase.ts` reads settings and the authoritative `kidColor` from game state, creates the client, passes `kidColor` into `rephrase()`, and returns `{ text, source, reason? }`. `src/server/app.ts` mounts the route. Route tests can use `mockOpenAi.app.request`.
- The route module owns the process-wide circuit breaker. It pauses after three consecutive timeouts or errors and exposes that state through the health or settings endpoint.
- `src/web/game/` owns the coach bubble's "Pip is thinking…" state, the `useRephrase` hook, and the `REPHRASED` coach event.
- Spec 07 connects rephrasing to lazy review text. Spec 09 adds parent-area text.
- The manual model measurements in `docs/llm-models.md` and the mock-server end-to-end test wait for the route and settings.
