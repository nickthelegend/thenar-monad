#!/usr/bin/env python3
"""Assemble one cut: the take full-frame, a Quest clip if there is one, the overlay, voice and a quiet bed.

  python3 video/assemble_cut.py <cut-name>     (after cut.py and render.mjs overlay2)
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = sys.argv[1]
W = os.path.join(HERE, "work", NAME)
T = json.load(open(os.path.join(W, "timing.json")))
FINAL = os.path.abspath(os.path.join(HERE, "..", T["out"]))
enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"]
run = lambda *a: subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True, cwd=W)



def sequence(list_file, out_dir, ext):
    """An ffmpeg concat list as an exact 30 fps image sequence (symlinks), since the concat demuxer
    rounds each image's duration to 1/25 s and the take's short frames would drift."""
    import shutil
    shutil.rmtree(out_dir, ignore_errors=True); os.makedirs(out_dir)
    base = os.path.dirname(list_file)
    L = [l.strip() for l in open(list_file) if l.strip()]
    items, t = [], 0.0
    for i, l in enumerate(L):
        if l.startswith("file") and i + 1 < len(L) and L[i + 1].startswith("duration"):
            f = l.split("'")[1]; f = f if os.path.isabs(f) else os.path.join(base, f)
            items.append((t, f)); t += float(L[i + 1].split()[1])
    n = int(round(T["total"] * 30)); k = 0
    for j in range(n):
        tt = j / 30
        while k + 1 < len(items) and items[k + 1][0] <= tt + 1e-6: k += 1
        os.symlink(items[k][1], os.path.join(out_dir, f"{j:06d}.{ext}"))


sequence(os.path.join(W, "demo.txt"), os.path.join(W, "seq_take"), "jpg")
sequence(os.path.join(W, "overlay", "list.txt"), os.path.join(W, "seq_overlay"), "png")
run("-framerate", "30", "-i", "seq_take/%06d.jpg", "-vf", "scale=1920:1080:flags=lanczos,setsar=1", *enc, "base_take.mp4")
q = next((s for s in T["scenes"] if s.get("clip")), None)
if q:
    a, b = q["start"], q["end"]
    run("-i", "base_take.mp4", "-i", q["clip"], "-filter_complex",
        f"[1:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,trim=0:{b-a:.3f},setpts=PTS-STARTPTS+{a:.3f}/TB[q];"
        f"[0:v][q]overlay=0:0:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[v]", "-map", "[v]", *enc, "base.mp4")
else:
    os.replace(os.path.join(W, "base_take.mp4"), os.path.join(W, "base.mp4"))

pad = os.path.join(W, "pad.wav")
expr = "0.10*sin(2*PI*110*t)+0.06*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.03*sin(2*PI*329.63*t)"
run("-f", "lavfi", "-i", f"aevalsrc='({expr})*(0.7+0.3*sin(2*PI*t/11))':s=48000:d={T['total']:.3f}",
    "-af", "lowpass=f=1200,aecho=0.8:0.7:200|360:0.3|0.2,volume=0.55", "-ac", "2", pad)
fc = ";".join([
    "[1:v]fps=30,format=rgba[ov];[0:v][ov]overlay=0:0:format=auto[v]",
    f"[3:a]afade=t=in:st=0:d=1,afade=t=out:st={T['total']-1.6:.3f}:d=1.6[bed]",
    "[2:a]aresample=48000,pan=stereo|c0=c0|c1=c0[vo]",
    "[vo][bed]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]",
])
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "base.mp4", "-framerate", "30", "-i", "seq_overlay/%06d.png",
                "-i", "narration.wav", "-i", pad, "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
                "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", f"{T['total']:.3f}", FINAL], check=True, cwd=W)
print("final:", FINAL)
