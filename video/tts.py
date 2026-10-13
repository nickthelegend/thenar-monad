#!/usr/bin/env python3
"""Voice every line with ElevenLabs, keeping its word timestamps.

One request per line, so each caption has exact timing and a changed line is
the only one re-voiced. Writes work/vo/<id>.mp3 and work/vo/lines.json
(id, text, said, seconds, words: [{w, start, end}]).
Run from the repo root: python3 video/tts.py [line-id ...]   (needs ELEVENLABS_API_KEY)
"""
import base64, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "work", "vo")
os.makedirs(OUT, exist_ok=True)
S = json.load(open(os.path.join(HERE, "script.json")))
take = json.load(open(os.path.join(HERE, "work", "take.json"))) if os.path.exists(os.path.join(HERE, "work", "take.json")) else {}
KEY = os.environ["ELEVENLABS_API_KEY"]
force = set(sys.argv[1:])

lines = [(f"intro_{i+1:02d}", t) for i, t in enumerate(S["intro"])]
for sc in S["scenes"]:
    for i, t in enumerate(sc["lines"]):
        lines.append((f"{sc['id']}_{i+1:02d}", t.replace("{TIMERS}", take.get("timersLine", "Executed in under a second, and final about six hundred milliseconds after that, on Monad testnet."))))
lines.append(("outro_01", S["outro"]["say"]))
if S.get("questLine"): lines.append(("quest_01", S["questLine"]))

manifest = os.path.join(OUT, "lines.json")
prev = {l["id"]: l for l in json.load(open(manifest))} if os.path.exists(manifest) else {}
out = []
for lid, text in lines:
    said = text
    for a, b in S.get("pron", {}).items():
        said = re.sub(rf"(?<![\w.-]){re.escape(a)}(?![\w-])", b, said)
    mp3 = os.path.join(OUT, f"{lid}.mp3")
    old = prev.get(lid)
    if old and old["said"] == said and old.get("voice") == S["voice"] and os.path.exists(mp3) and lid not in force:
        out.append(old); continue
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{S['voice']}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": said, "model_id": S["model"], "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15}}).encode(),
        headers={"xi-api-key": KEY, "content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=120))
    open(mp3, "wb").write(base64.b64decode(r["audio_base64"]))
    al = r["alignment"]
    words, cur = [], None
    for ch, st, en in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur: words.append(cur); cur = None
            continue
        if cur is None: cur = {"w": ch, "start": st, "end": en}
        else: cur["w"] += ch; cur["end"] = en
    if cur: words.append(cur)
    secs = al["character_end_times_seconds"][-1]
    out.append({"id": lid, "text": text, "said": said, "voice": S["voice"], "file": mp3, "seconds": round(secs, 3), "words": words})
    print(f"{lid} {secs:6.2f}s  {text[:70]}", flush=True)
json.dump(out, open(manifest, "w"), indent=1)
print(f"{len(out)} lines, {sum(l['seconds'] for l in out):.1f}s of speech")
