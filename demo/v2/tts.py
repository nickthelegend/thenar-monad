"""Kokoro narration: one engine, one voice, one speed, one loudness.

Reads demo/narration.json, writes demo/v2/audio/<id>.wav, and measures each
duration from the written file (never estimated) into durations.json, which the
driver holds each beat against.
"""
import json
import sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

D = "demo/v2"
kokoro = Kokoro(f"{D}/models/kokoro-v1.0.onnx", f"{D}/models/voices-v1.0.bin")
lines = json.load(open("demo/narration.json"))
TARGET_RMS = 0.075
# Spoken forms. The subtitles keep the written word; on its own "USDC" came
# out as a clipped "US". "MON" is the ticker, said as a word, and replaced
# case-sensitively so "Monad" is untouched; "Monadscan" is split so it is not
# read as one unfamiliar word.
SAY = {"USDC": "U S D C", "Monadscan": "Monad scan", "MON": "mon", "402": "four oh two"}
# Named ids regenerate just those lines and keep every other measured duration.
only = set(sys.argv[1:])
durations = json.load(open(f"{D}/audio/durations.json")) if only else {}
for item in lines:
    if only and item["id"] not in only:
        continue
    text = item["text"]
    for written, spoken in SAY.items():
        text = text.replace(written, spoken)
    samples, sr = kokoro.create(text, voice="af_heart", speed=1.0, lang="en-us")
    samples = np.asarray(samples, dtype=np.float32)
    rms = float(np.sqrt(np.mean(samples ** 2)))
    if rms <= 0:
        raise SystemExit(f"NO_AUDIO for {item['id']}")
    samples = np.clip(samples * (TARGET_RMS / rms), -0.98, 0.98)
    path = f"{D}/audio/{item['id']}.wav"
    sf.write(path, samples, sr)
    durations[item["id"]] = round(sf.info(path).duration, 3)
    print(f"{item['id']:<20} {durations[item['id']]:.2f}s")
json.dump(durations, open(f"{D}/audio/durations.json", "w"), indent=2)
print(f"total {sum(durations.values()):.1f}s")
