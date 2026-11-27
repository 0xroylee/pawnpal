# Pawnpal storybook film

A 30-second picture-book film, "Sam & Pip", read aloud, made from `docs/promo/pawnpal-sting-prompt.md`. `sting.js` draws every frame as a pure function of the frame number. Playwright screenshots each frame with your installed Google Chrome, and ffmpeg encodes the frames and mixes in the soundtrack.

## One-time setup (narrator voice)

The narrator is [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), a neural text-to-speech model that runs locally. The first run downloads the model.

```sh
brew install espeak-ng
cd tools/sting && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python "kokoro>=0.9.4" soundfile
```

## Build

```sh
node tools/sting/position.mjs "e4 e5 Nf3 Nc6 Bc4 d6 Nc3 g6 d4 exd4 Nxd4 Bg7 Be3 Nf6 O-O O-O h3 Re8" Nf5  # check the blunder
node tools/sting/moments.mjs                    # check the threat and the review moment
tools/sting/.venv/bin/python tools/sting/kokoro_tts.py   # speak story.json; writes durations back
node tools/sting/render.mjs --stills 255,347,620         # preview stills in out/stills/
node tools/sting/render.mjs --full              # 1800 frames at 59.94 fps in out/frames/
node tools/sting/audio.mjs                      # music + SFX + narration -> out/audio-raw.wav
```

Master the audio to −14 LUFS and below −1 dBTP, then encode:

```sh
cd tools/sting/out
ffmpeg -y -i audio-raw.wav -af "volume=5.2dB,alimiter=limit=0.74:level=false:attack=2:release=60:asc=1,afade=t=out:st=29.97:d=0.06" -c:a pcm_s24le audio.wav
ffmpeg -y -framerate 60000/1001 -i frames/%04d.png -i audio.wav -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart pawnpal-storybook-30s.mp4
```

## Changing the story

Edit the lines in `story.json`, rerun `kokoro_tts.py`, and check that no line overlaps the next. Other voices: `af_bella`, `af_nicole` and `bf_emma`, or change `speed`. If the animation needs to move, edit the `WARP` table at the top of the storybook section in `sting.js`. It maps real seconds to scene seconds.

To use a recorded voice, replace `out/narration/L0.wav`…`L8.wav` (48 kHz mono float WAV), update each line's `dur`, and rerun `audio.mjs`. Everything in `out/` and `.venv/` is generated and ignored by git.
