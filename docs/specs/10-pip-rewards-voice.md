# 10: Pip, rewards, read-aloud

**Depends on:** 04, 06

## Goal

Give kids a reason to come back: a friendly coach character, a small reward after every game, and a coach that speaks for kids who can't read well yet.

## Scope

**Pip the Pawn**
- SVG character with 5 expressions:

  | Expression | When |
  |---|---|
  | happy | default |
  | thinking | while the LLM is rewording |
  | surprised | blunder |
  | cheering | win or new badge |
  | encouraging | after a loss |

- A small idle blink animation, turned off under `prefers-reduced-motion`.
- A personality guide in `docs/pip-voice.md`: warm, brief, never sarcastic, celebrates effort over results. Template authors and the spec 08 prompt both follow it.

**Stars per game (0–3)**
- ★ for finishing the game (any end except abort, or resigning before move 10).
- ★ for no blunders that stood. Taken-back blunders don't count.
- ★ for a win or a draw.

**Badges (v1)**

| Badge | Earned when |
|---|---|
| first-game | Finished the first game |
| first-win | Won a game |
| first-checkmate | Won by delivering checkmate |
| clean-game | No standing mistakes or blunders in a game with at least 20 kid moves |
| comeback | Won after the kid's win chance dropped below 25 |
| fork-finder | Played a move tagged `played-fork` (spec 04) |
| try-again-hero | Fixed 5 mistakes with Try again (cumulative) |
| level-up | Won at a higher level than any previous win |

- Badges and stars are computed on the server when a game finishes, from `analysis_json`. The computation is idempotent.
- A badge shelf on the profile screen. A "New badge!" moment at game end, with Pip cheering.

**Read-aloud**
- Uses the Web Speech API (`speechSynthesis`), preferring a local English voice (`voice.localService`). Rate 0.95, pitch 1.1.
- Reads coach messages, hints, review text (one moment at a time) and badge announcements. A new message cancels the one being spoken.
- A speaker button on the bubble mutes for the profile, and the setting persists. The parent sets the default per profile.
- If no voice is available, the speaker button is hidden.
- iOS Safari only allows speech after a user gesture, so the first tap on "Play" unlocks it.

**Sounds.** The move sounds from spec 01 follow the profile's sound setting.

## Out of scope

Custom voices, recorded voice-over, more badges, streaks across days, leaderboards.

## Acceptance criteria

1. Pip's expression matches each event in the table above.
2. Under `prefers-reduced-motion`, there's no idle animation.
3. The star rules match a table test, including the taken-back-blunder case.
4. Each badge is awarded exactly once, from fixture games. Finishing the same game twice doesn't award it again.
5. The badge shelf shows earned badges with dates, and unearned ones as locked silhouettes.
6. With voice on, a coach message is spoken. A new message cancels the old one.
7. Muting persists across reloads for that profile only.
8. With no speech voices, the speaker button is hidden and nothing throws an error.
9. On iOS Safari (manual check), speech works after the first Play tap.

## Test plan

- **Unit:** star rules, each badge rule against fixture analyses, idempotency.
- **Component:** Pip expression mapping; speech wrapper with a fake `speechSynthesis`.
- **End-to-end:** finish a scripted game and check the stars and first-game badge; mute, reload, and check it's still muted.
- **Manual:** iPad Safari speech.

## Open questions

- Who draws Pip and the opponent animals (spec 02). Placeholder art until then.
