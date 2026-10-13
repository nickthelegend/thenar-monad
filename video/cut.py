#!/usr/bin/env python3
"""One cut of the take: voice it, time it, caption it.

  python3 video/cut.py video/cuts/demo.json          (from the repo root; needs ELEVENLABS_API_KEY)

A cut is a list of scenes. A footage scene names a mark in the take (work/capture/take.json)
and plays from it to the next mark, sped up only as far as its cap needs, and labelled when it is.
A card scene is a full-frame title the overlay draws. Narration is ElevenLabs (the voice in
script.json), one request per line, cached by text; captions come from its word timestamps.
Writes work/<cut>/{timing,overlay}.json, work/<cut>/narration.wav, work/<cut>/demo.txt and docs/demo/thenar-<cut>.srt.
"""
import base64, json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CUT = json.load(open(sys.argv[1]))
NAME = CUT["name"]
W = os.path.join(HERE, "work", NAME)
VO = os.path.join(HERE, "work", "vo2")
os.makedirs(W, exist_ok=True); os.makedirs(VO, exist_ok=True)
S = json.load(open(os.path.join(HERE, "script.json")))
take = json.load(open(os.path.join(HERE, "work", "capture", "take.json")))
VARS = json.load(open(os.path.join(HERE, "work", "vars.json"))) if os.path.exists(os.path.join(HERE, "work", "vars.json")) else {}
FPS, GAP, LEAD, TAIL = 30, 0.3, 0.35, 0.45
sub = lambda s: re.sub(r"\{(\w+)\}", lambda m: VARS.get(m.group(1), m.group(0)), s)

# ── voice ──────────────────────────────────────────────────────────────────
cache_file = os.path.join(VO, "cache.json")
cache = json.load(open(cache_file)) if os.path.exists(cache_file) else {}


def voice(text):
    said = text
    for a, b in S.get("pron", {}).items():
        said = re.sub(rf"(?<![\w.-]){re.escape(a)}(?![\w-])", b, said)
    for a, b in VARS.get("say", {}).items():
        said = said.replace(a, b)
    key = f"{S['voice']}|{said}"
    if key in cache and os.path.exists(cache[key]["file"]):
        return cache[key]
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{S['voice']}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": said, "model_id": S["model"], "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15}}).encode(),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=120))
    f = os.path.join(VO, f"{len(cache):04d}.mp3")
    open(f, "wb").write(base64.b64decode(r["audio_base64"]))
    al, words, cur = r["alignment"], [], None
    for ch, st, en in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            if cur: words.append(cur); cur = None
            continue
        if cur is None: cur = {"w": ch, "start": st, "end": en}
        else: cur["w"] += ch; cur["end"] = en
    if cur: words.append(cur)
    cache[key] = {"file": f, "seconds": al["character_end_times_seconds"][-1], "words": words}
    json.dump(cache, open(cache_file, "w"))
    print(f"  voiced {cache[key]['seconds']:5.2f}s  {text[:60]}", flush=True)
    return cache[key]


# ── timeline ───────────────────────────────────────────────────────────────
placed, cues = [], []


def chunks(text, cap=56):
    out, cur = [], ""
    for w in text.split():
        if cur and (len(cur) + 1 + len(w) > cap or (re.search(r"[.:?!]$", cur) and len(cur) > 22)):
            out.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur: out.append(cur)
    if len(out) > 1 and len(out[-1]) < 12:
        last = out.pop(); out[-1] += " " + last
    return out


def place(text, t):
    v = voice(text)
    placed.append((t, v["file"]))
    words = v["words"]; said = " ".join(w["w"] for w in words)
    def at(frac):
        k = frac * len(said); acc = 0
        for w in words:
            if acc + len(w["w"]) >= k: return w["start"] + (w["end"] - w["start"]) * max(0, k - acc) / max(1, len(w["w"]))
            acc += len(w["w"]) + 1
        return words[-1]["end"]
    pos = 0
    for c in chunks(text):
        a = pos / len(text); pos += len(c) + 1; b = min(1, pos / len(text))
        cues.append({"start": round(t + at(a), 3), "end": round(t + at(b) + 0.12, 3), "text": c})
    return t + v["seconds"]


marks = sorted(take["marks"], key=lambda m: m["t"])
mt = {m["id"]: m["t"] for m in marks}
frames = take["frames"]
BLACK = os.path.join(W, "black.jpg")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080", "-frames:v", "1", BLACK], check=True)
QUEST = os.path.join(HERE, "quest", "quest-3s.mp4")
t, scenes, demo, n = 0.0, [], [], 0
for sc in CUT["scenes"]:
    if sc["id"] == "quest_slot" and not os.path.exists(QUEST): continue
    lines = [sub(x) for x in sc.get("lines", [])]
    need = (LEAD + sum(voice(x)["seconds"] for x in lines) + GAP * (len(lines) - 1) + TAIL) if lines else 0
    start = t; u = t + LEAD
    for x in lines: u = place(x, u) + GAP
    if "card" in sc:
        dur = max(need, 2.5) + sc.get("hold", 0)
        card = {k: sub(v) for k, v in sc["card"].items()}
        scenes.append({"id": sc["id"], "card": card, "start": round(start, 3), "end": round(start + dur, 3)})
        demo.append((BLACK, dur))
    elif sc["id"] == "quest_slot":
        qd = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", QUEST], capture_output=True, text=True).stdout)
        dur = max(need, min(qd, sc.get("cap", 28)))
        n += 1
        scenes.append({"id": "quest", "n": f"{n:02d}", "title": sc.get("title", "On a real Quest 3S"), "start": round(start, 3), "end": round(start + dur, 3),
                       "clip": QUEST, "notes": ["REAL QUEST 3S · RECORDED ON THE HEADSET"]})
        demo.append((BLACK, dur))
    else:
        a = mt[sc["id"]] + sc.get("skip", 0)
        b = mt[sc["to"]] if sc.get("to") else min([m["t"] for m in marks if m["t"] > mt[sc["id"]]] or [frames[-1]])
        if sc.get("upto"): b = min(b, a + sc["upto"])
        foot = b - a
        dur = max(need, min(foot, sc.get("cap", foot)))
        speed = max(1.0, foot / dur)
        n += 1
        notes = list(sc.get("notes", []))
        if speed > 1.04: notes.append(f"{speed:.1f}× SPEED")
        scenes.append({"id": sc["id"], "n": f"{n:02d}", "title": sc.get("title", ""), "start": round(start, 3), "end": round(start + dur, 3), "speed": round(speed, 3), "notes": notes, "mask": sc.get("mask")})
        idx = [i for i, ft in enumerate(frames) if a <= ft < b]
        if not idx or frames[idx[0]] > a:   # start on the frame showing at a
            prev = [i for i, ft in enumerate(frames) if ft <= a]
            if prev: idx = [prev[-1]] + idx
        used = 0.0
        for k, i in enumerate(idx):
            nxt = frames[idx[k + 1]] if k + 1 < len(idx) else b
            d = (nxt - max(frames[i], a)) / speed
            if k == len(idx) - 1: d = dur - used
            demo.append((os.path.join(HERE, "work", "capture", "frames", f"{i:06d}.jpg"), max(d, 0.0))); used += d
    t = start + dur
TOTAL = round(t, 3)

cues.sort(key=lambda c: c["start"])
for x, y in zip(cues, cues[1:]):
    x["end"] = min(x["end"], round(y["start"] - 0.03, 3))

args, fc = [], []
for k, (st, f) in enumerate(placed):
    args += ["-i", f]; ms = int(st * 1000)
    fc.append(f"[{k}:a]aresample=48000,adelay={ms}|{ms}[a{k}]")
fc.append("".join(f"[a{k}]" for k in range(len(placed))) + f"amix=inputs={len(placed)}:normalize=0,apad,atrim=0:{TOTAL}[o]")
subprocess.run(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", ";".join(fc), "-map", "[o]", "-ac", "1", os.path.join(W, "narration.wav")], check=True)
with open(os.path.join(W, "demo.txt"), "w") as f:
    for p, d in demo: f.write(f"file '{p}'\nduration {d:.5f}\n")
    f.write(f"file '{demo[-1][0]}'\n")


def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


srt = os.path.join(ROOT, CUT["out"].replace(".mp4", ".srt"))
with open(srt, "w") as f:
    for k, c in enumerate(cues, 1): f.write(f"{k}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n\n")
json.dump({"total": TOTAL, "cues": cues, "scenes": scenes}, open(os.path.join(W, "overlay.json"), "w"))
json.dump({"total": TOTAL, "out": CUT["out"], "scenes": scenes}, open(os.path.join(W, "timing.json"), "w"), indent=1)
for s in scenes:
    print(f"  {s['id']:12} {s['start']:7.2f} -> {s['end']:7.2f} ({s['end']-s['start']:5.2f}s){'  x%.2f' % s['speed'] if s.get('speed', 1) > 1.04 else ''}")
print(f"{NAME}: total {TOTAL:.2f}s ({int(TOTAL//60)}:{TOTAL%60:05.2f}), {len(cues)} cues, {len(CUT.get('scenes'))} scenes; max {CUT.get('max')}")
