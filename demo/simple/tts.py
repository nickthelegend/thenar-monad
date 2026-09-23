"""Narration for the short demo: Kokoro, one voice, one loudness.

Reads demo/simple/narration.json, writes demo/simple/audio/<id>.wav, and
measures each duration from the written file into durations.json, which the
driver holds each beat against.

  python3 demo/simple/tts.py
"""
import json
import os
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

D = "demo/simple"
M = "demo/v2/models"
os.makedirs(f"{D}/audio", exist_ok=True)
kokoro = Kokoro(f"{M}/kokoro-v1.0.onnx", f"{M}/voices-v1.0.bin")
TARGET_RMS = 0.075
# Spoken forms; the captions keep the written word.
SAY = {"USDC": "U S D C", "Monadscan": "Monad scan"}
durations = {}
for item in json.load(open(f"{D}/narration.json")):
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
    print(f"{item['id']:<10} {durations[item['id']]:.2f}s")
json.dump(durations, open(f"{D}/audio/durations.json", "w"), indent=1)
print(f"total {sum(durations.values()):.1f}s")
