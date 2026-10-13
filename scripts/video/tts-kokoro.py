"""Renders the demo narration locally with Kokoro (open model, Apache 2.0), one clip
per line, named as in demo/audio/manifest.json, and writes demo/audio/durations.json.
No account, no key, nothing leaves the machine.

Kokoro lives outside the repo (by default D:/tts/milestone-escrow): a venv with
kokoro-onnx and soundfile, and models/ with kokoro-v1.0.fp16.onnx and
voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases.

    D:/tts/milestone-escrow/venv/Scripts/python.exe scripts/video/tts-kokoro.py --samples
    D:/tts/milestone-escrow/venv/Scripts/python.exe scripts/video/tts-kokoro.py --voice am_michael
    D:/tts/milestone-escrow/venv/Scripts/python.exe scripts/video/tts-kokoro.py --voice am_michael --speed 1.05 --force
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
AUDIO = ROOT / "demo" / "audio"
KOKORO = pathlib.Path(os.environ.get("KOKORO_DIR", "D:/tts/milestone-escrow/models"))
SAMPLE_VOICES = ["am_michael", "am_fenrir", "bm_george", "af_heart", "bf_emma"]

FFMPEG_DIRS = [
    r"C:\Users\Jeroen\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0.2-full_build\bin",
]


def tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for folder in FFMPEG_DIRS:
        candidate = pathlib.Path(folder) / f"{name}.exe"
        if candidate.exists():
            return str(candidate)
    sys.exit(f"{name} not found. Install it with: winget install --id Gyan.FFmpeg")


def duration(path: pathlib.Path) -> float:
    out = subprocess.run([tool("ffprobe"), "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def render(kokoro, text: str, voice: str, speed: float, target: pathlib.Path) -> float:
    import soundfile as sf

    lang = "en-gb" if voice.startswith("b") else "en-us"
    samples, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / "line.wav"
        sf.write(wav, samples, rate)
        # A little silence trimmed at both ends keeps the pacing to the mux's own gaps.
        subprocess.run([tool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-i", str(wav),
                        "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                               "silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                        "-c:a", "libmp3lame", "-b:a", "192k", str(target), "-y"], check=True)
    return duration(target)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="am_michael")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--force", action="store_true", help="render lines that already have a clip again")
    parser.add_argument("--samples", action="store_true", help=f"render the first line in {', '.join(SAMPLE_VOICES)} to demo/audio/samples/")
    args = parser.parse_args()

    model, voices = KOKORO / "kokoro-v1.0.fp16.onnx", KOKORO / "voices-v1.0.bin"
    if not model.exists() or not voices.exists():
        sys.exit(f"Kokoro model files not found in {KOKORO} (set KOKORO_DIR)")
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(str(model), str(voices))
    manifest = json.loads((AUDIO / "manifest.json").read_text(encoding="utf-8"))

    if args.samples:
        out = AUDIO / "samples"
        out.mkdir(exist_ok=True)
        for voice in SAMPLE_VOICES:
            seconds = render(kokoro, manifest[0]["text"] + " " + manifest[1]["text"], voice, args.speed, out / f"{voice}.mp3")
            print(f"  {voice:12} {seconds:.1f}s  {out / (voice + '.mp3')}")
        print("Listen, then render all lines with --voice <name>")
        return 0

    durations_path = AUDIO / "durations.json"
    durations = json.loads(durations_path.read_text(encoding="utf-8")) if durations_path.exists() else {}
    print(f"Voice {args.voice}, speed {args.speed}, {len(manifest)} lines")
    for line in manifest:
        target = AUDIO / line["file"]
        if target.exists() and not args.force:
            durations[line["key"]] = duration(target)
            continue
        durations[line["key"]] = render(kokoro, line["text"], args.voice, args.speed, target)
        print(f"  {line['order']:2}  {durations[line['key']]:.1f}s  {line['text'][:60]}")
    durations_path.write_text(json.dumps(durations, indent=2) + "\n", encoding="utf-8")
    total = sum(durations[m["key"]] for m in manifest)
    print(f"{total:.1f} s of narration; the video adds about {len(manifest) * 0.45 + 2.4:.0f} s of pauses")
    print("Next: npm run video:record, then npm run video:build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
