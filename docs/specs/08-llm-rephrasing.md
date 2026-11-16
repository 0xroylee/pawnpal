# 08: LLM rephrasing

**Depends on:** 04

## Goal

When a parent connects an LLM, Pip's messages sound warmer and more varied, but Pip never says anything the engine didn't confirm. Without an LLM, nothing changes.

## Scope

**Client (`src/server/llm/`)**
- Talks to any OpenAI-compatible server: `POST {baseUrl}/chat/completions` (not streamed), with an optional `Authorization: Bearer <apiKey>` header.
- Lists models with `GET {baseUrl}/models`. Ollama, LM Studio, the llama.cpp server and most cloud providers support this.
- Settings, stored in the `settings` table:
  - `enabled`
  - `baseUrl` (default `http://127.0.0.1:11434/v1`)
  - `model`
  - `apiKey` (optional; stored in the local database, which is only readable by the user)
  - `timeoutMs` (default 3000)

**Endpoint: `POST /api/coach/rephrase`**
- Request: `{ fact: CoachFact, mode: 'nudge'|'explain'|'reveal'|'praise'|'hint', templateText, kidAge?, language: 'en' }`
- Response: `{ text, source: 'llm' | 'template', reason? }`

**Prompt**
- **System:** "You are Pip, a friendly chess coach talking to a child aged {age or 'about 8'}. Rewrite the coach note for the child in at most two short sentences. Use only the facts given. Never mention a move, square or piece that isn't in the facts. No numbers, no evaluations, no notation unless it's listed in the facts. {mode rule}"
- **Mode rule for nudge:** "Do not reveal the better move."
- **User:** the fact as JSON, using piece names, plus the template text as a reference.
- Temperature 0.6, `max_tokens` 120.

**Validator (`src/shared/coach/validateRephrase.ts`)**, run on the server before anything is returned:
- Strip `<think>…</think>` blocks (some Qwen-style models emit them) and trim the text.
- At most 220 characters and 2 sentences.
- Every square token (`[a-h][1-8]`) must be in `fact.squares`.
- Every token that looks like SAN must be in `fact.moves`. In nudge mode, `fact.betterMoveSan` must not appear at all.
- No digits, except inside allowed squares and moves.
- Piece words (king, queen, rook, bishop, knight, pawn and their plurals) must be pieces that appear in `fact.pieces`.
- No URLs, no emoji, nothing from a small list of unsafe words.
- Reject meta openings such as "Sure", "Here is" or "As an AI".
- On failure, return the template text with `source: 'template'` and a `reason` code. The reason goes to the server log and the dev debug panel.

**Privacy.** The model writes "you". The kid's name is never sent, and none is added afterwards.

**Coach bubble behavior**
- Shows "Pip is thinking…" for up to `timeoutMs`, then the final text. Speech (spec 10) starts only once the final text is set.
- **Circuit breaker:** after 3 timeouts or errors in a row, the LLM is paused for the rest of the session. The parent area shows "The coach brain was too slow, so Pip is using built-in messages." It tries again on the next start.
- The review (spec 07) rewords each moment only when that moment is opened.

## Out of scope

Streaming, free-form kid questions, languages other than English, downloading models inside the app.

## Acceptance criteria

1. With the LLM disabled, no outbound HTTP request is made (test with a network spy).
2. With a mock OpenAI-compatible server returning valid text, the bubble shows it and `source` is `llm`.
3. A mock reply with a square that isn't in the facts falls back to the template with `reason: 'unknown-square'`.
4. A mock reply that mentions a queen when the fact is about a knight is rejected.
5. A nudge-mode reply that contains the better move is rejected.
6. A mock that takes 5 s gets the template after 3 s. Three of those in a row open the circuit breaker.
7. No request body ever contains the profile name (test).
8. `<think>` blocks are stripped before validation.
9. **Manual measurement (not a CI gate):** run 100 fixture facts against real Ollama with each recommended model, and record the validator pass rate and median latency in `docs/llm-models.md`. Target: a pass rate of at least 80% for the small-tier model.

## Test plan

- **Unit:** a table of at least 40 good and bad outputs for the validator; prompt building for each mode.
- **Server:** endpoint tests against a mock LLM server (success, invalid output, timeout, error, circuit breaker).
- **End-to-end:** a mock LLM server is configured, a blunder shows the LLM text, and an invalid mock reply shows the template.

## Open questions

- Whether to send Qwen's `/no_think` hint or depend on the timeout. Measure both during criterion 9.
