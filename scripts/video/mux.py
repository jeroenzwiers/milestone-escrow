"""Builds the finished demo video from the storyboard stills and the narration clips.

Adapted from the Study Coach mux. Each narration line (demo/audio/manifest.json)
gets exactly the length of its clip plus a short pause; the stills the recorder
took for that line's cue are spread evenly over it. A line without stills keeps
the previous picture. Nothing in the picture is invented: the waiting for agents
and for PayPal is simply not shown.

    node scripts/video/lines.mjs
    python scripts/video/split_narration.py
    node scripts/video/record.mjs
    python scripts/video/mux.py

Writes demo/video/milestone-escrow-demo.mp4.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
VIDEO = ROOT / "demo" / "video"
AUDIO = ROOT / "demo" / "audio"

LEAD = 0.6    # seconds of picture before the first word
GAP = 0.45    # pause between lines
TAIL = 1.8    # hold on the closing card after the last word
LIMIT = 179.0 # the judges stop watching at three minutes

CANDIDATES = [
    r"C:\Users\Jeroen\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0.2-full_build\bin",
]


def tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for folder in CANDIDATES:
        candidate = pathlib.Path(folder) / f"{name}.exe"
        if candidate.exists():
            return str(candidate)
    sys.exit(f"{name} not found. Install it with: winget install --id Gyan.FFmpeg")


def main() -> int:
    manifest = json.loads((AUDIO / "manifest.json").read_text(encoding="utf-8"))
    durations_path = AUDIO / "durations.json"
    board_path = VIDEO / "storyboard.json"
    if not durations_path.exists():
        sys.exit("No clips yet: python scripts/video/split_narration.py")
    if not board_path.exists():
        sys.exit("No stills yet: node scripts/video/record.mjs")
    durations = json.loads(durations_path.read_text(encoding="utf-8"))
    board = json.loads(board_path.read_text(encoding="utf-8"))

    missing = [m["text"][:50] for m in manifest if m["key"] not in durations or not (AUDIO / m["file"]).exists()]
    if missing:
        sys.exit(f"{len(missing)} lines have no clip, e.g. {missing[0]!r}")

    stills: dict[str, list[str]] = {}
    for b in board:
        stills.setdefault(b["cue"], []).append(b["file"])

    # Lay out the lines back to back and give each its stills.
    clips, shown = [], []           # (start_s, file), (start_s, still)
    t = LEAD
    current = board[0]["file"]
    shown.append((0.0, current))
    for line in manifest:
        seconds = durations[line["key"]]
        clips.append((t, line["file"]))
        own = stills.get(line["cue"], [])
        # Lines that share a cue share its stills: split them between those lines.
        sharing = [m for m in manifest if m["cue"] == line["cue"]]
        if own and len(sharing) > 1:
            part = sharing.index(line)
            per = max(1, len(own) // len(sharing))
            own = own[part * per:(part + 1) * per] if part < len(sharing) - 1 else own[part * per:]
        slot = seconds + GAP
        for i, still in enumerate(own):
            shown.append((t + slot * i / len(own), still))
            current = still
        t += slot
    total = t + TAIL - GAP
    if total > LIMIT:
        print(f"WARNING: {total:.1f}s is over the {LIMIT:.0f}s the judges watch; shorten the narration")

    # Each still is held until the next; the last until the end.
    listing = []
    for i, (start, still) in enumerate(shown):
        end = shown[i + 1][0] if i + 1 < len(shown) else total
        if end - start < 0.04:
            continue
        listing.append(f"file '{(VIDEO / still).as_posix()}'")
        listing.append(f"duration {end - start:.3f}")
    listing.append(f"file '{(VIDEO / shown[-1][1]).as_posix()}'")
    concat = VIDEO / "frames.txt"
    concat.write_text("\n".join(listing), encoding="utf-8")

    # Two passes, as in the Study Coach build: first the voice track, then the encode.
    track = VIDEO / "voice-track.m4a"
    build = [tool("ffmpeg"), "-hide_banner", "-loglevel", "error"]
    for _, file in clips:
        build += ["-i", str(AUDIO / file)]
    parts = []
    for i, (start, _) in enumerate(clips):
        delay = int(round(start * 1000))
        parts.append(f"[{i}:a]adelay={delay}|{delay},aformat=channel_layouts=stereo[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(clips)))
    parts.append(f"{mix}amix=inputs={len(clips)}:normalize=0:dropout_transition=0[mixed]")
    parts.append("[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]")
    build += ["-filter_complex", ";".join(parts), "-map", "[out]", "-t", f"{total:.3f}",
              "-c:a", "aac", "-b:a", "192k", str(track), "-y"]
    print(f"mixing {len(clips)} clips...")
    subprocess.run(build, check=True)

    target = VIDEO / "milestone-escrow-demo.mp4"
    # The PayPal window is smaller than the app; fit every still into 1920x1080 on white.
    fit = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1"
    mux = [tool("ffmpeg"), "-hide_banner", "-loglevel", "error",
           "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(track),
           "-map", "0:v", "-map", "1:a", "-vf", fit,
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
           "-c:a", "copy", "-t", f"{total:.3f}", str(target), "-y"]
    print(f"encoding {len(shown)} stills over {total:.1f} s...")
    subprocess.run(mux, check=True)
    print(f"written: {target}  ({total:.1f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
