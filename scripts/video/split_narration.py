"""Cuts the narrator recording into one clip per line of the demo video.

Ported from the Study Coach video tooling. Paste `demo/audio/lines-narrator.txt`
into the speech engine in one go - the blank lines between sentences become
pauses - save the result as `demo/audio/narrator.mp3`, and run this. It finds
the pauses, cuts there, names each piece with the hash in
`demo/audio/manifest.json`, and writes `demo/audio/durations.json` for the
recorder.

    node scripts/video/lines.mjs                 # manifest + text to paste
    python scripts/video/split_narration.py

Splitting on silence alone does not work: on a real ElevenLabs render the
pauses inside a sentence were 0.40-0.46 s and the pauses between lines
0.46-0.57 s, so no threshold separates them. Instead the audio is cut finely and
the pieces are grouped by how long each line ought to take, from its word count.
A line twice as long as its neighbour takes about twice as long to say, and that
places every boundary without having to classify a single gap.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
AUDIO = ROOT / "demo" / "audio"

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


def duration(path: pathlib.Path) -> float:
    out = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def silences(path: pathlib.Path, gap: float, floor: int) -> list[tuple[float, float]]:
    out = subprocess.run(
        [tool("ffmpeg"), "-hide_banner", "-nostats", "-i", str(path),
         "-af", f"silencedetect=noise={floor}dB:d={gap}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    spans, start = [], None
    for line in out.stderr.splitlines():
        m = re.search(r"silence_start: ([0-9.]+)", line)
        if m:
            start = float(m.group(1))
        m = re.search(r"silence_end: ([0-9.]+)", line)
        if m and start is not None:
            spans.append((start, float(m.group(1))))
            start = None
    return spans


def cut_points(path: pathlib.Path, gap: float, floor: int) -> list[tuple[float, float]]:
    """Speech spans, from the gaps between them."""
    total = duration(path)
    quiet = silences(path, gap, floor)
    spans, position = [], 0.0
    for begin, end in quiet:
        if begin - position > 0.25:          # not a pause inside a sentence
            spans.append((position, begin))
        position = end
    if total - position > 0.25:
        spans.append((position, total))
    return spans


def group_segments(spans: list[tuple[float, float]], weights: list[int]) -> list[tuple[float, float]] | None:
    """Merge consecutive speech segments into one group per line.

    Thresholding the gaps cannot work here: on a real ElevenLabs render the
    pauses inside a sentence measured 0.40 to 0.46 s and the pauses between
    lines 0.46 to 0.57 s. The classes overlap, so no value of --gap separates
    them - which is the same shape as the problem this project exists to solve.

    So the gaps are not classified at all. The segments are cut finely, and then
    grouped by what the text says each line should weigh: the split that gets
    the group durations closest to the word proportions wins. A line twice as
    long as its neighbour should take about twice as long to say, and that is
    enough to place every boundary.
    """
    if len(spans) < len(weights):
        return None
    if len(spans) == len(weights):
        return spans, list(range(1, len(spans) + 1))

    total = sum(e - b for b, e in spans)
    share = [w / sum(weights) for w in weights]
    n, k = len(spans), len(weights)
    best: dict[tuple[int, int], tuple[float, list[int]]] = {}

    def solve(start: int, line: int) -> tuple[float, list[int]]:
        if line == k - 1:
            length = sum(spans[i][1] - spans[i][0] for i in range(start, n))
            return ((length / total - share[line]) ** 2, [n])
        key = (start, line)
        if key in best:
            return best[key]
        winner = (float("inf"), [])
        # Leave room for one segment per remaining line.
        for end in range(start + 1, n - (k - line - 1) + 1):
            length = sum(spans[i][1] - spans[i][0] for i in range(start, end))
            cost = (length / total - share[line]) ** 2
            rest_cost, rest = solve(end, line + 1)
            if cost + rest_cost < winner[0]:
                winner = (cost + rest_cost, [end] + rest)
        best[key] = winner
        return winner

    _, cuts = solve(0, 0)
    return cuts_to_groups(spans, cuts), cuts


def cuts_to_groups(spans, cuts):
    groups, start = [], 0
    for end in cuts:
        groups.append((spans[start][0], spans[end - 1][1]))
        start = end
    return groups


def drop_a_stolen_opening(spans, cuts, max_extra=1.0):
    """Move a boundary back one piece when it sat past the obvious break.

    Weighing the pieces by length puts a boundary close and sometimes one piece
    late, and the clip then ends with the opening of the next line - heard as a
    second "That's right" inside a question.

    The test is narrow on purpose. Three broader attempts each repaired one line
    and broke others: ranking pauses globally put boundaries inside sentences, a
    pause bonus in the cost function cut a clip to half a second, and snapping
    every boundary to its nearest biggest gap damaged the narrator. So a
    boundary only moves when all of this holds:

      - the biggest pause inside the group is clearly bigger than the one the
        boundary sits on, by at least 50 ms
      - it is exactly one piece earlier, not two
      - that piece is under a second, which is the length of an opening phrase
        rather than of anything a line ends with
      - and the group is not the last, whose boundary is the end of the file

    On this pack that is three lines out of sixteen, and none in the narrator or
    the student.
    """
    gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
    moved = []
    start = 0
    for index in range(len(cuts) - 1):          # never the last group
        end = cuts[index]
        inner = [(gaps[j], j) for j in range(start, min(end, len(gaps)))]
        start = end
        if len(inner) < 2:
            continue
        biggest, where = max(inner)
        if where != end - 2:                    # must be exactly one piece back
            continue
        if biggest <= gaps[end - 1] + 0.05:
            continue
        extra = spans[end - 1][1] - spans[end - 1][0]
        if extra > max_extra:
            continue
        if end - 1 <= (cuts[index - 1] if index else 0):
            continue                            # would empty this group
        cuts[index] = end - 1
        moved.append(extra)
    return moved


def split(role: str, manifest: list[dict], gap: float, floor: int, tempo: float) -> bool:
    source = AUDIO / f"{role}.mp3"
    if not source.exists():
        print(f"  {role:9} no {source.name} yet - skipped")
        return True

    wanted = [m for m in manifest if m.get("role", "narrator") == role]
    found = cut_points(source, gap, floor)
    # Characters, not words. "That's right." is two words and thirteen
    # characters, and it takes about as long to say as thirteen characters
    # anywhere else - so weighing by words made it look six times shorter than
    # it is, and a boundary landed a whole segment late. The clip then ended
    # with the opening of the next line, which is how a second "That's right"
    # got inside a question.
    grouped = group_segments(found, [len(m["text"]) for m in wanted])
    spans = None
    if grouped is not None:
        if isinstance(grouped, tuple):
            spans, cuts = grouped
            moved = drop_a_stolen_opening(found, cuts)
            if moved:
                spans = cuts_to_groups(found, cuts)
                total = sum(moved)
                print(f"            {len(moved)} boundaries moved back"
                      f" ({total:.1f}s of the next line returned)")
        else:
            spans = grouped
    if spans:
        total = sum(e - b for b, e in spans)
        chars = sum(len(m["text"]) for m in wanted)
        for span, entry in zip(spans, wanted):
            want = len(entry["text"]) / chars * total
            got = span[1] - span[0]
            if abs(got - want) > max(1.0, want * 0.35):
                print(f"            check: {got:.1f}s where {want:.1f}s expected"
                      f" - {entry['text'][:40]}")
    if spans is None:
        print(f"  {role:9} FOUND {len(found)} pieces, NEED at least {len(wanted)} - nothing written")
        print(f"            the engine ran the lines together; try --gap {gap / 2:.2f}")
        return False
    if len(found) != len(wanted):
        print(f"  {role:9} {len(found)} pieces grouped into {len(wanted)} lines by expected length")

    for span, entry in zip(spans, wanted):
        begin, end = span
        target = AUDIO / entry["file"]
        command = [tool("ffmpeg"), "-hide_banner", "-loglevel", "error",
                   "-ss", f"{begin:.3f}", "-to", f"{end:.3f}", "-i", str(source)]
        if abs(tempo - 1.0) > 0.001:
            # atempo resamples without touching pitch, which is the difference
            # between a voice that talks faster and a voice on a sped-up tape.
            command += ["-af", f"atempo={tempo:.3f}"]
        command += ["-c:a", "libmp3lame", "-b:a", "192k", str(target), "-y"]
        subprocess.run(command, check=True)
    lengths = {entry["key"]: round(duration(AUDIO / entry["file"]), 3) for entry in wanted}
    existing = json.loads((AUDIO / "durations.json").read_text(encoding="utf-8")) if (AUDIO / "durations.json").exists() else {}
    existing.update(lengths)
    (AUDIO / "durations.json").write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    spoken = sum(e - b for b, e in spans) / tempo
    note = f" at {tempo:.2f}x" if abs(tempo - 1.0) > 0.001 else ""
    print(f"  {role:9} {len(wanted)} clips written{note}, {spoken:.0f} s of speech")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("roles", nargs="*", default=None)
    parser.add_argument("--gap", type=float, default=0.30,
                        help="shortest quiet stretch to cut at; finer is better, "
                             "since the grouping puts the pieces back together")
    parser.add_argument("--tempo", type=float, default=1.0,
                        help="speed up the clips without changing pitch. ElevenLabs "
                             "runs about 15 characters a second against Chrome's 19, "
                             "so 1.26 brings a whole pack back to the length the "
                             "video was cut for")
    parser.add_argument("--floor", type=int, default=-40,
                        help="dB below which audio counts as quiet")
    args = parser.parse_args()

    path = AUDIO / "manifest.json"
    if not path.exists():
        sys.exit("No manifest. Run: node scripts/video/lines.mjs")
    manifest = json.loads(path.read_text(encoding="utf-8"))

    roles = args.roles or sorted({m.get("role", "narrator") for m in manifest})
    ok = all(split(role, manifest, args.gap, args.floor, args.tempo) for role in roles)
    print()
    print("Next: node scripts/video/record.mjs, then python scripts/video/mux.py")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
