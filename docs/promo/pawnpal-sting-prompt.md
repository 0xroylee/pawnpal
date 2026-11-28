<context>
Pawnpal is a free, offline chess coach for kids aged about 6–12 who already know how the pieces move. Chess tutorials are boring, and a beginner usually can't tell which move went wrong or why. In Pawnpal, Stockfish checks every move, Pip the Pawn (the AI coach) explains in plain words, the kid tries again with hints, and a short review walks through the key moments. Pip's wording comes from a small local model we fine-tuned ourselves (`pawnpal-pip`), trained on 500 rounds. It rewords facts Stockfish has already confirmed and never calculates chess. We build it for fun and to learn how to apply AI to a real problem.

The film is a picture book read aloud: "Sam & Pip, a Pawnpal story". A narrator tells how Sam plays chess with Pip and how the AI teaches him. The words light up on the left page as they're read, and the chess happens on the right page. No home screens, menus, setup or onboarding.
</context>

<inputs>
- Story text, voice and line start times: `tools/sting/story.json`. The narrator is the Kokoro-82M neural voice "af_heart" (Apache-2.0, runs locally) at speed 1.05. `kokoro_tts.py` writes each line's real duration back into the file.
- Pip: the five expressions in `design/assets/pip/`.
- Colours: `design/tokens.css`. The paper is #FFFBF3, faded (not yet read) words are #CFC6B6, and the cover is the ink navy gradient with sun-yellow trim.
- Type: Nunito Variable, weights 700, 800 and 900.
- Pip's speech bubbles use the app's own templates (`src/web/i18n/en.json`), filled from engine-checked facts.
</inputs>

<story>
A 30-second square film at 1080×1080 (master 59.94 fps, 1800 frames, 30.03 s). Everything happens in one continuous shot of a book on a soft blue table, with page turns instead of cuts.

| Time (s) | Pages | Narrator | Picture |
|---|---|---|---|
| 0–3.85 | Cover → endpaper → title page | "This is the story of Sam, and a little pawn named Pip." | The closed hardcover, "Sam & Pip · A Pawnpal story". The front board swings open on its spine joint (1.2–2.1) as one stiff board with a visible edge, and lands showing the patterned endpaper (pastedown) inside it. A "Sam & Pip" title page sits on the right. The title page turns like paper (2.9–3.85) into chapter 1. |
| 3.2–11.25 | Ch. 1 *Pip sees danger* | "Sam was playing the computer. Its rook moved, and Pip spotted danger." / "But Sam jumped the knight forward. Oh no! A pawn could take it." | Black's rook slides f8→e8 (5.0). A dashed orange arrow grows e8→e4 (5.4). Pip says "Look at what the rook can attack." (5.9). The cursor drags the knight d4→f5 (8.15–8.85). The danger ring and "!!" appear, and Pip looks surprised (9.05). |
| 11.85–17.3 | Ch. 2 *How Pip thinks* | "Pip asked Stockfish to check the move." / "Then Pip's small AI turned the facts into kind words." | "Stockfish is checking": depth 1 → 18, candidate arrows, gxf5, win chance 52% → 12%, "!! Blunder" (13.5). Then CHESS FACTS (hanging piece · knight f5 · pawn g6 · checked by Stockfish ✓) stream into pawnpal-pip ("small AI model · trained on 500 rounds"), which types "Can your knight stay safe here?" (15.4–16.4). |
| 17.9–22.8 | Ch. 3 *Try again* | "Sam tried again, and Pip gave hints." / "Rook to e1! The pawn was safe." | Try again (18.25) slides the knight back. More help (19.0, 19.6, 20.2) steps through "Take a look at your rook." → "Your pawn needs protection." → a blue arrow and "Try the move shown by the arrow." The cursor plays Re1 (20.6–21.05), a ✓ pops, and Pip cheers: "That's better. Your pawn is safe now." |
| 23.4–26.6 | Ch. 4 *Looking back* | "After the game, they looked back together." | Game review, moment 1 of 2: "You fixed it!" Next (25.0) pushes to moment 2 of 2: "Missed capture", "Your pawn could have won the opponent's bishop there." |
| 26.6–30.03 | The book closes | "And every game, Sam got a little bit better." | The whole read half (front board plus every page read) lifts as one thick block, its page edges showing, and lands on the right with the cover facing up (26.6–27.6). The shadow it cast on the table fades as it lifts. "Pawnpal · Learn chess with an AI coach" fades in. |

Page turns (11.25–11.85, 17.3–17.9, 22.8–23.4) behave like real paper. The sheet is cut into 20 strips chained in 3D, and the page opens outward, toward the reader. Fingers lift the outer edge first, then the sheet swings up from the spine while its free edge trails behind in an outward arc and floats down last. Each strip is shaded by its angle, and the turning sheet casts a moving shadow on the page underneath. Real hardcover behaviour: boards never bend and carry their own 12 px margin, the inside of the cover is an endpaper (never story text), and the page stacks move from right to left as pages turn. The last spread's left half is already drawn as the board that lifts to close, and a 3D layer is kept from frame to frame, so the text never redraws with a visible pop.

The scenes are laid out on a scene clock, and a `WARP` table maps real time onto it. The read-along words always use real time, so they stay in sync with the voice.

Projection: one pinhole camera looks straight down at the book. A point on a sheet at distance u from the spine, lifted by angle θ, sits at x = spine + u·cos θ, height z = u·sin θ. It appears at c + (x − c)·D/(D − z), where c is the camera's centre and D its height. D comes from a 32° field of view (D = 540 / tan 16° ≈ 1883 px at zoom 1) and shrinks as the camera pushes in. Every 3D move uses this one camera (CSS `perspective` = D, `perspective-origin` = c), so a turning page narrows by cos θ and its raised edge grows toward the lens by the right amount at every angle.

Lighting: sunlight comes from the east (the right of the frame), about 50° above the table, so every shadow falls to the west:
- **The book's shadow:** the book casts a soft shadow to the left on the table, open or closed.
- **Lifting sheets:** anything that lifts (the cover, a turning page, the closing block) throws a shadow worked out from its real height. The shadow stretches westward across the pages or the table as the sheet rises and shrinks back as it lands.
- **Shading:** each face is shaded by its angle to the sun. The printed side darkens as it lifts away from the east, and the back brightens as it comes over. Shading blends smoothly across the curl and equals flat paper whenever a sheet lies flat, so landings don't pop.
- **Small shadows:** lifted chess pieces, boards, speech bubbles and cards also cast their shadows to the left.

The camera pushes gently toward the board during each chess action, but never so far that the words being read leave the frame.
</story>

<chess>
Verified by `tools/sting/position.mjs` and `tools/sting/moments.mjs` (chess.js and Stockfish 19). The game: 1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Nc3 g6 5.d4 exd4 6.Nxd4 Bg7 7.Be3 Nf6 8.O-O O-O 9.h3 Re8. The kid plays White.

- 9...Re8 attacks e4. If White ignores it, Nxe4 wins the pawn (−0.91).
- 10.Nf5?? is a blunder: win chance 52 → 12, answered by gxf5.
- 10.Re1 is best (+0.22) and defends e4, which is then attacked twice and defended twice.
- After 10...Bf5, 11.a3?? (win chance 90 → 47) misses exf5, which wins the bishop.

If you change the game, rerun both scripts and update every line.
</chess>

<sound>
Exactly 30.03 s, mastered to −14 LUFS with a true peak of −1 dBTP or lower, and no fade except over the last 60 ms.

- Narration: Kokoro "af_heart", levelled to a fixed speech loudness and placed at the story.json start times. The music ducks 6 dB under each line, and the voice sits about 12 dB above it.
- Music: a 96 BPM bedtime tune, played rather than programmed:
  - instruments: a music-box arpeggio in eighths, a soft pad, pizzicato bass and a marimba melody
  - feel: every note varies slightly in timing (±14–18 ms) and loudness (±20%); offbeats swing a little, music-box tines are a touch out of tune, attacks are soft, and the last bar slows down
  - "thinking" woodblock ticks play through chapter 2
  - chords: C Am F G Am F C G C F G C
- SFX:
  - a music-box sparkle at the start
  - a swish and a soft thump as the cover opens and closes
  - a paper swish on each page turn
  - wooden lifts and drops for every piece move
  - a marimba warning and a two-note "uh-oh"
  - depth ticks, a falling celesta and a low hit on "Blunder"
  - sparkles as the facts stream into the model, a celesta answer, and soft typing ticks with uneven spacing
  - clicks with rising marimba notes on More help
  - a celesta ✓ chime and a music-box run when Pip cheers
</sound>

<build>
`tools/sting/README.md` has the commands. `sting.js` draws each frame as a pure function of the frame number (t = f / 29.97): no timers, no transitions, no Math.random. The pieces:
- read-along word timing comes from story.json
- boards come from chess.js positions with the Pawnpal piece set
- page turns are CSS 3D: paper bends as chained strips, the hard cover swings as one board
- paper texture is SVG `feTurbulence`

Page turns use a strip-chained curl (see the story section). `audio.mjs` synthesises the music and SFX and mixes in the narration WAVs.
</build>

<gotchas>
- Run `kokoro_tts.py` after editing any story line, then check that no line overlaps the next. If timings move, update the `WARP` table so the pictures still match the words.
- Kokoro is Apache-2.0, and the af_heart voice ships with the model. For an even warmer read, replace `out/narration/L*.wav` with a recorded voice (same names, 48 kHz mono float) and rerun `audio.mjs`.
- Every chess claim must match Stockfish and the app's grading. Take Pip's wording from the app's templates.
- Measure text only after the fonts load.
</gotchas>
