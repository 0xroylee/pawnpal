# LLM rephrasing

This folder holds the server side of Pip's optional rewording. A parent can connect an OpenAI-compatible model, such as a local Ollama. The model only rewords a coach note the templates already wrote. If it is off, slow, failing or rejected, the kid gets the template text. [Spec 08](../../../docs/specs/08-llm-rephrasing.md) has the product rules.

## Files

- `brain.ts`: `CoachBrain`, the one object the routes talk to. `src/server/db/routes.ts` creates it with the `Library` and an optional `fetch`. It reads the saved settings on every call, runs the circuit breaker, lists models for the parent screen, and runs the parent's test call. `suggestModel()` picks the suggested model for this computer's RAM.
- `client.ts`: `createLlmClient()` sends `POST {baseUrl}/chat/completions` and `GET {baseUrl}/models`, with a bearer token when an API key is set. Every request has a timeout, 3000 ms by default. Failures throw `LlmError` with the code `timeout`, `http`, `network` or `bad-response`.
- `rephrase.ts`: `rephrase()` builds the request with `buildRephraseRequest()`, strips thinking blocks with `stripThinking()`, and checks the reply with `validateRephrase()`. It returns `{ text, source: "llm" }`, or the template text with `source: "template"` and a `reason`. An `LlmError` gives its code as the reason, and any other error gives `network`. It skips the call with the reason `reveals-better-move` when `shouldCallLlm()` says no: a nudge or hint whose better move is castling.
- `recommended-models.json`: RAM tiers for `suggestModel()`, as `{ belowGiB, model }` entries. The first entry whose `belowGiB` is `null` or above the computer's RAM wins. It has one entry today, `qwen3:1.7b-q4_K_M`.
- `mockOpenAi.ts`: an in-process Hono app that answers `/models` and `/chat/completions` with scripted replies, delays and errors, and records every request. Server tests, `tests/e2e/llm.spec.ts`, `tests/integration/model-baseline.test.ts` and the training tests use it.

The prompt builder, the validator and `shouldCallLlm()` live in `src/shared/coach/`, so the runtime and the training pipeline in `training/` judge a model by the same rules.

## Routes

`src/server/parent/routes.ts` mounts these under `/api`. Each body goes through `jsonBody()` with a zod schema from `src/server/db/schemas.ts`.

| Route                                | Gate       | Does                                                                                                         |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /coach/status`                  | none       | Returns `{ enabled, paused, timeoutMs }` for the browser                                                     |
| `POST /coach/rephrase`               | none       | Rewords one note through `CoachBrain.phrase()` (`rephraseSchema`)                                            |
| `GET /parent/settings/coach`         | parent PIN | Returns the settings without the API key, plus `hasApiKey` and `paused`                                      |
| `PUT /parent/settings/coach`         | parent PIN | Saves the settings and resets the breaker. Turning the model on needs a model name                           |
| `POST /parent/settings/coach/models` | parent PIN | Returns `{ connected, models, suggested }`                                                                   |
| `POST /parent/settings/coach/test`   | parent PIN | Rewords a fixed example fact with a 10 s timeout and returns the result with `elapsedMs`. Needs a model name |
| `POST /parent/settings/reset`        | parent PIN | Erases the data, and resets the breaker too                                                                  |

In the browser, `useRephrasedMessage` in `src/web/game/` posts only messages that carry a fact. It shows "Pip is thinking" while it waits, aborts after `timeoutMs`, and falls back to the template text on a timeout or network error. The browser never calls the model itself.

## Settings

The settings live in the `settings` table under the key `llm` and follow `llmSettingsSchema`. `Library.getLlmSettings()` falls back to the defaults when the value is missing or invalid: off, `http://127.0.0.1:11434/v1` (Ollama), no model, and a 3000 ms timeout, which is also the maximum. When a save leaves out the API key and keeps the base URL, `CoachBrain.configuration()` keeps the saved key.

For a `qwen3` model on the local Ollama URL, the brain sends `reasoning_effort: "none"` so the model skips its thinking step. When the base URL is the default Ollama URL, `models()` first checks `http://127.0.0.1:11434/api/version` with a 1.2 s timeout and reports `connected: false` if Ollama isn't running.

## Circuit breaker

`CoachBrain` counts failures in a row with the reasons `timeout`, `http`, `network` and `bad-response`. After three, it pauses: `phrase()` returns the template text without a call, and `status()` reports `paused: true`. Any other result, such as a good reply or a validator rejection, sets the count back to zero. Saving the coach settings or resetting the data calls `reset()`, which clears the count and starts a new generation, so a reply that was already on its way can't count against the new settings. The count lives in memory, so restarting the server also clears it.

## What leaves the machine

The chat request carries a system prompt with the kid's age, or "about 8" when the profile has none. It also carries the fact as JSON (its kind, each piece with its owner and square, and any moves, squares, better move and mate count) and the template text as a reference note. It never carries the kid's name, games or database. The parent's test call sends a fixed example fact. AGENTS.md lists any change to this request as one to ask about first.

## Tests

- `client.test.ts` and `rephrase.test.ts` cover the client and the fallback reasons against `mockOpenAi`.
- `src/server/parent/parent.test.ts` covers the routes, the pause after three failures and `suggestModel()`.
- `tests/e2e/llm.spec.ts` connects a mock model from the parent screen, then checks a reworded nudge, a rejected reply, and that the kid's name never reaches the model.
- `docs/llm-models.md` records manual measurements of real models.
