"""Speaks story.json with the Kokoro neural voice into out/narration/L{i}.wav
(48 kHz mono float) and writes each line's duration back into story.json.
Run with tools/sting/.venv/bin/python (see README)."""
import json
import pathlib
import subprocess

import numpy as np
import soundfile as sf
from kokoro import KPipeline

here = pathlib.Path(__file__).parent
story_path = here / "story.json"
story = json.loads(story_path.read_text())
out = here / "out" / "narration"
out.mkdir(parents=True, exist_ok=True)
pipe = KPipeline(lang_code=story.get("lang", "a"), repo_id="hexgrad/Kokoro-82M")

for i, line in enumerate(story["lines"]):
    parts = [audio for _, _, audio in pipe(line["text"], voice=story["voice"], speed=story["speed"])]
    audio = np.concatenate([np.asarray(p, dtype=np.float32) for p in parts])
    # trim leading/trailing near-silence so start times mean "first word"
    idx = np.where(np.abs(audio) > 0.01)[0]
    audio = audio[max(0, idx[0] - 240) : idx[-1] + 2400]
    raw = out / f"L{i}-24k.wav"
    sf.write(raw, audio, 24000, subtype="FLOAT")
    wav = out / f"L{i}.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ar", "48000", "-ac", "1", "-c:a", "pcm_f32le", str(wav)], check=True)
    raw.unlink()
    line["dur"] = round(len(audio) / 24000, 3)
    nxt = story["lines"][i + 1]["start"] if i + 1 < len(story["lines"]) else None
    end = line["start"] + line["dur"]
    flag = "  OVERLAPS next line" if nxt is not None and end > nxt else ""
    print(f"L{i} {line['start']:.2f}-{end:.2f}s ({line['dur']:.2f}){flag}  {line['text']}")

story_path.write_text(json.dumps(story, indent=2) + "\n")
