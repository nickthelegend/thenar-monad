#!/usr/bin/env python3
"""Put the cut together: intro + the take + outro, the overlay on top, voice and a quiet bed.

Run from the repo root after render.mjs has written work/{intro,outro,overlay}/:
  python3 video/assemble.py
Output: docs/demo/thenar-metropolis.mp4 (1920x1080, H.264 + AAC, -16 LUFS)
"""
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(HERE, "work")
T = json.load(open(os.path.join(W, "timing.json")))
FINAL = os.path.join(HERE, "..", "docs", "demo", "thenar-metropolis.mp4")
enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"]
run = lambda *a: subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True, cwd=W)

run("-framerate", "30", "-i", "intro/%06d.jpg", *enc, "intro.mp4")
run("-framerate", "30", "-i", "outro/%06d.jpg", *enc, "outro.mp4")
demo = T["demoEnd"] - T["intro"]
# the take sits in a frame: 80% size, a band above for the tags and one below for the captions
run("-f", "concat", "-safe", "0", "-i", "demo.txt", "-vf", "fps=30,scale=1536:864:flags=lanczos,setsar=1,"
    "pad=1920:1080:192:104:color=black,drawbox=x=191:y=103:w=1538:h=866:color=0x34343B:t=1", "-t", f"{demo:.3f}", *enc, "demo.mp4")
open(os.path.join(W, "parts.txt"), "w").write("file 'intro.mp4'\nfile 'demo.mp4'\nfile 'outro.mp4'\n")
run("-f", "concat", "-safe", "0", "-i", "parts.txt", "-c", "copy", "base_take.mp4")
# A real Quest 3S clip, if there is one, goes over its scene's span, fitted inside 1920x1080.
q = next((s for s in T["scenes"] if s.get("clip")), None)
if q:
    a, b = q["start"], q["end"]
    run("-i", "base_take.mp4", "-i", q["clip"], "-filter_complex",
        f"[1:v]fps=30,scale=1536:864:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:104+(864-ih)/2:color=black,setsar=1,trim=0:{b-a:.3f},setpts=PTS-STARTPTS+{a:.3f}/TB[q];"
        f"[0:v][q]overlay=0:0:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[v]", "-map", "[v]", *enc, "base.mp4")
else:
    os.replace(os.path.join(W, "base_take.mp4"), os.path.join(W, "base.mp4"))

# a quiet bed: a slow A-minor pad, up in the intro and outro, tucked under the voice in between
pad = os.path.join(W, "pad.wav")
expr = "0.10*sin(2*PI*110*t)+0.06*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.03*sin(2*PI*329.63*t)"
run("-f", "lavfi", "-i", f"aevalsrc='({expr})*(0.7+0.3*sin(2*PI*t/11))':s=48000:d={T['total']:.3f}",
    "-af", "lowpass=f=1200,aecho=0.8:0.7:200|360:0.3|0.2", "-ac", "2", pad)
a, b = T["intro"], T["demoEnd"]
vol = f"if(lt(t,{a-1:.2f}),0.30,if(lt(t,{a:.2f}),0.30-(t-{a-1:.2f})*0.22,if(gt(t,{b:.2f}),0.32,0.08)))"
fc = ";".join([
    "[0:v][1:v]overlay=0:0:format=auto:shortest=0[v]",
    f"[3:a]volume='{vol}':eval=frame,afade=t=in:st=0:d=1,afade=t=out:st={T['total']-1.6:.3f}:d=1.6[bed]",
    "[2:a]aresample=48000,pan=stereo|c0=c0|c1=c0[vo]",
    "[vo][bed]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]",
])
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-stats", "-y", "-i", "base.mp4", "-f", "concat", "-safe", "0", "-i", "overlay/list.txt",
                "-i", "narration.wav", "-i", pad, "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
                "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", f"{T['total']:.3f}", os.path.abspath(FINAL)], check=True, cwd=W)
print("final:", os.path.abspath(FINAL))
