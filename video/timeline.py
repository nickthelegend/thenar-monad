#!/usr/bin/env python3
"""Lay the cut out: intro, the demo scenes cut from the take, outro; narration and captions.

Inputs : script.json, work/vo/lines.json (tts.py), work/capture/take.json (capture.mjs)
Outputs: work/timing.json, work/narration.wav, work/{intro,outro,overlay}.json (render.mjs data),
         work/demo.txt (the take's frames as an ffmpeg concat list, timed to the cut),
         ../docs/demo/thenar-metropolis.srt
Run from the repo root: python3 video/timeline.py
"""
import json, os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(HERE, "work")
S = json.load(open(os.path.join(HERE, "script.json")))
L = {l["id"]: l for l in json.load(open(os.path.join(W, "vo", "lines.json")))}
take = json.load(open(os.path.join(W, "capture", "take.json")))
FPS, GAP, LEAD, TAIL = 30, 0.35, 0.5, 0.6
OUTRO = 5.5
# Longest each scene may run; footage longer than that plays faster, and says so.
CAP = {"home": 14, "start": 8, "passkey": 14, "station": 10, "drive": 24, "verdict": 3.5, "submit": 8,
       "paid": 11, "corpus": 12, "agent": 13, "network": 13}
NOTES = {"passkey": ["PASSKEY: CHROMIUM VIRTUAL AUTHENTICATOR"],
         "station": ["WEBXR · EMULATED HEADSET (IWER) · NOT A REAL QUEST"],
         "drive": ["WEBXR · EMULATED HEADSET (IWER) · LIVE MONAD TESTNET", "CONTROLLER PATH SCRIPTED BY PLAYWRIGHT"],
         "agent": ["THE AGENT CLI, RUN LIVE · OUTPUT AS IT ARRIVED"]}

placed, cues = [], []          # (start, line) and caption cues


def chunks(text, cap=50):
    out, cur = [], ""
    for w in text.split():
        if cur and (len(cur) + 1 + len(w) > cap or re.search(r"[.:?!]$", cur) and len(cur) > 18):
            out.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur: out.append(cur)
    if len(out) > 1 and len(out[-1]) < 12:
        last = out.pop(); out[-1] += " " + last
    return out


def place(lid, t):
    """Put a line on the timeline at t; captions follow its own word timings."""
    l = L[lid]
    placed.append((t, l))
    words = l["words"]
    said = " ".join(w["w"] for w in words)
    # map a fraction of the shown text onto the spoken words
    def at(frac):
        k = frac * len(said); acc = 0
        for w in words:
            if acc + len(w["w"]) >= k: return w["start"] + (w["end"] - w["start"]) * max(0, k - acc) / max(1, len(w["w"]))
            acc += len(w["w"]) + 1
        return words[-1]["end"]
    text = l["text"]; pos = 0
    for c in chunks(text):
        a = pos / len(text); pos += len(c) + 1; b = min(1, pos / len(text))
        cues.append({"start": round(t + at(a), 3), "end": round(t + at(b) + 0.15, 3), "text": c})
    return t + l["seconds"]


# intro
t = 0.9
intro_lines = []
for i in range(len(S["intro"])):
    lid = f"intro_{i+1:02d}"
    s = t; t = place(lid, t); intro_lines.append({"start": round(s, 3), "end": round(t, 3)})
    t += GAP + (0.25 if i in (1, 3) else 0)
INTRO = round(t + 1.4, 3)

# demo scenes, from the take's marks
marks = {m["id"]: m["t"] for m in take["marks"]}
order = [sc["id"] for sc in S["scenes"]] + ["end"]
# A real Quest 3S capture, if one has been dropped in, gets its own scene after the paid run.
QUEST = os.path.join(HERE, "quest", "quest-3s.mp4")
quest = None
if os.path.exists(QUEST):
    qd = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", QUEST], capture_output=True, text=True).stdout)
    CAP.update(home=9, corpus=9, network=9, drive=21, paid=9)   # room for the clip inside 3:00
    quest = {"id": "quest", "title": "On a real Quest 3S", "lines": [S["questLine"]], "len": min(qd, 28.0)}
frames = take["frames"]
t = INTRO
scenes, demo = [], []
plan = []
for n, sc in enumerate(S["scenes"]):
    plan.append((sc, marks[sc["id"]], marks[order[n + 1]]))
    if sc["id"] == "paid" and quest: plan.append((quest, None, None))
for n, (sc, a, b) in enumerate(plan):
    sid = sc["id"]
    if a is None:   # the Quest clip: the bed holds, and assemble.py lays the clip over this span
        lines = ["quest_01"]
        need = LEAD + L["quest_01"]["seconds"] + TAIL
        dur = max(need, sc["len"]); start = t; place("quest_01", t + LEAD)
        scenes.append({"id": sid, "n": f"{n+1:02d}", "title": sc["title"], "start": round(start, 3), "end": round(start + dur, 3), "from": None, "to": None, "speed": 1, "clip": QUEST, "clipLen": sc["len"],
                       "notes": ["REAL QUEST 3S · RECORDED ON THE HEADSET"]})
        demo.append((demo[-1][0], dur)); t = start + dur
        continue
    foot = b - a
    lines = [f"{sid}_{i+1:02d}" for i in range(len(sc["lines"]))]
    need = LEAD + sum(L[x]["seconds"] for x in lines) + GAP * (len(lines) - 1) + TAIL
    dur = max(need, min(foot, CAP[sid]))
    speed = max(1.0, foot / dur)
    start = t; u = t + LEAD
    for x in lines: u = place(x, u) + GAP
    notes = list(NOTES.get(sid, []))
    if speed > 1.04: notes.append(f"{speed:.1f}× SPEED")
    scenes.append({"id": sid, "n": f"{n+1:02d}", "title": sc["title"], "start": round(start, 3), "end": round(start + dur, 3), "from": a, "to": b, "speed": round(speed, 3), "notes": notes})
    # the take's frames in [a, b), each held for its own interval / speed; the last one holds to the scene's end
    idx = [i for i, ft in enumerate(frames) if a <= ft < b]
    if not idx: idx = [max(i for i, ft in enumerate(frames) if ft < a)]
    used = 0.0
    for k, i in enumerate(idx):
        nxt = frames[idx[k + 1]] if k + 1 < len(idx) else b
        d = (nxt - max(frames[i], a)) / speed
        if k == len(idx) - 1: d = dur - used
        demo.append((i, max(d, 0.0))); used += d
    t = start + dur
DEMO_END = t
TOTAL = round(t + OUTRO, 3)
place("outro_01", DEMO_END + 0.8)

# captions must not overlap
cues.sort(key=lambda c: c["start"])
for x, y in zip(cues, cues[1:]):
    x["end"] = min(x["end"], round(y["start"] - 0.03, 3))

# narration track
args, fc = [], []
for k, (st, l) in enumerate(placed):
    args += ["-i", l["file"]]; ms = int(st * 1000)
    fc.append(f"[{k}:a]aresample=48000,adelay={ms}|{ms}[a{k}]")
fc.append("".join(f"[a{k}]" for k in range(len(placed))) + f"amix=inputs={len(placed)}:normalize=0,apad,atrim=0:{TOTAL}[o]")
subprocess.run(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", ";".join(fc), "-map", "[o]", "-ac", "1", os.path.join(W, "narration.wav")], check=True)

# the take's frames, as a concat list
with open(os.path.join(W, "demo.txt"), "w") as f:
    for i, d in demo:
        f.write(f"file 'capture/frames/{i:06d}.jpg'\nduration {d:.5f}\n")
    f.write(f"file 'capture/frames/{demo[-1][0]:06d}.jpg'\n")


def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


os.makedirs(os.path.join(HERE, "..", "docs", "demo"), exist_ok=True)
with open(os.path.join(HERE, "..", "docs", "demo", "thenar-metropolis.srt"), "w") as f:
    for k, c in enumerate(cues, 1):
        f.write(f"{k}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n\n")

json.dump({"total": INTRO, "lines": intro_lines, "armSrc": "../public/hero-arm.webm"}, open(os.path.join(W, "intro.json"), "w"))
json.dump({"total": OUTRO, "tag": S["outro"]["tag"], "url": S["outro"]["url"], "chips": ["MONAD TESTNET", "PASSKEYS · P-256", "x402", "CHAINLINK CRE"]}, open(os.path.join(W, "outro.json"), "w"))
json.dump({"total": TOTAL, "cues": cues, "scenes": scenes}, open(os.path.join(W, "overlay.json"), "w"))
json.dump({"intro": INTRO, "demoEnd": DEMO_END, "total": TOTAL, "scenes": scenes}, open(os.path.join(W, "timing.json"), "w"), indent=1)
for s in scenes:
    print(f"{s['id']:8} {s['start']:7.2f} -> {s['end']:7.2f} ({s['end']-s['start']:5.2f}s) footage {(s['to'] or 0)-(s['from'] or 0):6.2f}s speed {s['speed']}")
print(f"intro {INTRO:.2f}s, total {TOTAL:.2f}s ({int(TOTAL//60)}:{TOTAL%60:05.2f}), {len(cues)} cues")
