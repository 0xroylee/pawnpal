# 09: Setup wizard and parent area

**Depends on:** 06, 08

## Goal

A parent who isn't technical gets from `npx pawnpal` to a kid playing in under three minutes. Connecting an LLM is optional, and settings are locked away from the kid.

## Scope

**First-run wizard** (shown while no profiles exist)
1. **Welcome:** what pawnpal is, and one privacy line: "Everything stays on this computer."
2. **Parent PIN:** 4 digits, entered twice. Required, because it protects the settings.
3. **First kid profile:** name, avatar, optional age, and "Has your kid played before?":

   | Answer | Starting level |
   |---|---|
   | Never | 1 |
   | A little | 3 |
   | Plays often | 5 |

4. **Coach brain (optional).** The server probes `http://127.0.0.1:11434/api/version` (Ollama) and `{baseUrl}/models`.
   - **Ollama found, with models:** list them and highlight the suggested one from `src/server/llm/recommended-models.json`, based on the computer's RAM (`os.totalmem()`).
   - **Ollama found, no models:** show `ollama pull <suggested>` with a copy button and a "Check again" button.
   - **Ollama not found:**
     - a link to ollama.com and a "Check again" button
     - "Use another server" (base URL + optional API key)
     - "Skip, use the built-in coach"
   - **Test:** runs one fixture rewording and shows the text and how long it took. Above 3 s it warns: "This model may be too slow on this computer. Try a smaller one."
5. **Done:** go to the profile picker.

**`recommended-models.json`** (initial values, to be re-checked against the spec 08 measurements before release):

| RAM | Suggested |
|---|---|
| < 12 GB | `qwen3:1.7b` |
| 12–24 GB | `qwen3:4b` |
| 24–40 GB | `qwen3:8b` |
| ≥ 40 GB | `qwen3:14b` |

On Windows and Linux, GPU memory can't be detected reliably, so the UI says "suggested," not "required."

**Parent area** (gear icon → PIN prompt)
- **Profiles:**
  - add a profile
  - edit name, avatar, age, level, voice, sound, Offer Try again
  - delete, with type-to-confirm; this hard-deletes the profile's games and badges
- **Coach brain:** the same panel as wizard step 4, plus an on/off switch.
- **Play on other devices:** network mode toggle (spec 11).
- **Data:** export each profile's PGN, show the data folder path, "Reset everything" (type-to-confirm).
- **Change PIN.**

**Parent gate**
- The PIN is stored as an scrypt hash with a random salt in `settings`.
- A correct PIN gives an HttpOnly session cookie that expires after 15 minutes idle.
- After 5 wrong attempts, the PIN prompt locks for 60 s.
- **Parent-gated routes:**
  - creating profiles after the wizard
  - deleting profiles
  - editing profile settings, except level (see below)
  - LLM settings
  - network mode
  - export and reset
- **Kid-facing routes:**
  - list profiles
  - play
  - history and review
  - pick a level at game setup
  - answer a level suggestion
  - mute voice and sound
- **Forgot PIN:** `npx pawnpal reset-pin` clears it from the terminal. Terminal access stands in for parent access.

## Out of scope

Downloading models inside the app, multiple parent accounts, a math-question gate (kids aged 8–12 can solve those).

## Acceptance criteria

1. On a fresh `PAWNPAL_HOME`, the wizard appears. After it finishes, the next start goes to the profile picker.
2. Mismatched PIN entries are rejected. The stored PIN is never in plaintext.
3. With Ollama and models present, they're listed and the RAM tier's suggestion is highlighted.
4. With Ollama absent, the install link, "Use another server" and Skip all work. Skip leaves the LLM disabled.
5. Test shows the reworded text and the time taken, and warns above 3 s.
6. Every parent-gated route returns 401 without a valid session (route-by-route API test).
7. 5 wrong PINs lock the prompt for 60 s.
8. `pawnpal reset-pin` clears the PIN. The next gear tap asks the parent to set a new one.
9. A kid can pick a level and mute sound without the PIN, but can't turn off the coach or change LLM settings.
10. A scripted run of the whole wizard with no LLM finishes in under 3 minutes for a first-time tester (manual check, recorded in the spec 12 checklist).

## Test plan

- **Unit:** PIN hashing and checking, lockout timer, RAM tier selection.
- **API:** gate coverage test that lists every route and its expected access.
- **End-to-end:** the wizard with a mocked Ollama (models present / no models / absent), then parent area edits.

## Open questions

- Whether the session cookie should be per device in network mode (it is by default, since cookies are per browser).
