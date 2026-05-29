/**
 * Generate the fixture assets the renderer needs, using the system ffmpeg, so
 * the demo renders offline with no downloads. Produces:
 *   public/assets/images/grad.png   1920x1080 gradient
 *   public/assets/images/grid.png   1920x1080 test grid
 *   public/assets/audio/s{1,2,3}.mp3  3s sine tones at different pitches
 *   public/assets/music/bg.mp3        10s soft low pad (to show ducking)
 *
 * Run: bun run packages/render/scripts/make-fixtures.ts
 */
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const imgDir = join(pub, "assets", "images");
const audDir = join(pub, "assets", "audio");
const musDir = join(pub, "assets", "music");
mkdirSync(imgDir, { recursive: true });
mkdirSync(audDir, { recursive: true });
mkdirSync(musDir, { recursive: true });

function ff(args: string[]) {
  const r = spawnSync("ffmpeg", ["-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

// Gradient image (diagonal blue→purple via a gradients source).
ff([
  "-f", "lavfi",
  "-i", "gradients=s=1920x1080:c0=0x101a40:c1=0x7c6cff:x0=0:y0=0:x1=1920:y1=1080:d=1",
  "-frames:v", "1",
  join(imgDir, "grad.png"),
]);

// Test grid image.
ff([
  "-f", "lavfi",
  "-i", "testsrc2=s=1920x1080:d=1",
  "-frames:v", "1",
  join(imgDir, "grid.png"),
]);

// Three short sine tones so scene changes are audible.
const tones: Array<[string, number]> = [
  ["s1.mp3", 330],
  ["s2.mp3", 440],
  ["s3.mp3", 550],
];
for (const [name, hz] of tones) {
  ff([
    "-f", "lavfi",
    "-i", `sine=frequency=${hz}:duration=3`,
    "-af", "volume=0.2,afade=t=in:st=0:d=0.1,afade=t=out:st=2.8:d=0.2",
    join(audDir, name),
  ]);
}

// Background music: a soft two-note low pad spanning the whole piece, so the
// ducking-under-narration behaviour is audible in the rendered fixture.
ff([
  "-f", "lavfi",
  "-i", "sine=frequency=110:duration=10",
  "-f", "lavfi",
  "-i", "sine=frequency=165:duration=10",
  "-filter_complex", "[0][1]amix=inputs=2,volume=0.5",
  join(musDir, "bg.mp3"),
]);

console.log("Fixture assets written to", pub);
