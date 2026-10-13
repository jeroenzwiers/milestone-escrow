// Turns demo/video/narration.json into the text to paste into the speech engine and a
// manifest that names each line by a hash of its text (the same scheme as the Study Coach
// video). Change a sentence and only that line's clip needs rendering again.
//
//   node scripts/video/lines.mjs
//
// Writes demo/audio/lines-narrator.txt (paste into ElevenLabs; blank lines become pauses)
// and demo/audio/manifest.json.
import { createHash } from "node:crypto";
import fs from "node:fs";

const lines = JSON.parse(fs.readFileSync("demo/video/narration.json", "utf8"));
const key = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);

fs.mkdirSync("demo/audio", { recursive: true });
fs.writeFileSync("demo/audio/lines-narrator.txt", lines.map((l) => l.text).join("\n\n") + "\n");
const manifest = lines.map((l, i) => ({ order: i + 1, key: key(l.text), scene: l.scene, cue: l.cue, text: l.text, file: `${key(l.text)}.mp3` }));
fs.writeFileSync("demo/audio/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
console.log(`${lines.length} lines, ${words} words (about ${Math.round((words / 150) * 60)} s at 150 words/min)`);
console.log("Paste demo/audio/lines-narrator.txt into ElevenLabs and save the result as demo/audio/narrator.mp3");
