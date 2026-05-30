import { spawnSync } from "node:child_process";
import type { Scene } from "@loom/spec";
import { PipelineError } from "./errors";

/**
 * Measure an audio file's duration in whole milliseconds via ffprobe (ships with
 * ffmpeg, which the project already requires). The voice stage uses this to set
 * each scene's true duration so the timeline math is exact.
 */
export function probeDurationMs(file: string): number {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  if (res.error) {
    throw new PipelineError(
      `ffprobe failed (${res.error.message}). Is ffmpeg installed and on PATH?`,
    );
  }
  if (res.status !== 0) {
    throw new PipelineError(`ffprobe could not read ${file}: ${res.stderr.trim()}`);
  }
  const seconds = Number.parseFloat(res.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new PipelineError(`ffprobe returned an invalid duration for ${file}: "${res.stdout.trim()}"`);
  }
  return Math.round(seconds * 1000);
}

/**
 * Transcode an arbitrary audio file into the project's standard narration format
 * (mono mp3, 44.1kHz, 128kbps) at `dest`, via ffmpeg. Used to bring a recorded
 * take or an imported file into the same shape `voice` produces, so `align` and
 * the renderer treat it identically. Overwrites `dest`.
 */
export function transcodeToMp3(src: string, dest: string): void {
  const res = spawnSync(
    "ffmpeg",
    // -y overwrite, -ac 1 mono (narration), -ar 44100, libmp3lame @ 128k.
    ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "128k", dest],
    { encoding: "utf8" },
  );
  if (res.error) {
    throw new PipelineError(
      `ffmpeg failed (${res.error.message}). Is ffmpeg installed and on PATH?`,
    );
  }
  if (res.status !== 0) {
    throw new PipelineError(`ffmpeg could not transcode ${src}: ${res.stderr.trim()}`);
  }
}

/**
 * A short, deliberate beat left after narration ends so a cut doesn't clip the
 * last word, while keeping scene-to-scene pauses tight. The crossfade transition
 * (~300ms) overlaps the next scene on top of this.
 */
export const NARRATION_TAIL_MS = 400;

/**
 * Attach narration audio to a scene and fit its lone slide to the narration, so a
 * single-slide scene runs exactly as long as the voice-over (plus one small tail
 * beat) — never cutting mid-sentence, and never sitting silent afterward.
 *
 * The *measured* audio duration is authoritative here: earlier stages size slides
 * from `estimateNarrationMs` (a pre-audio wpm guess) only so the project renders
 * before any audio exists. Once we have real audio we replace that estimate rather
 * than `max()`-ing with it — otherwise an over-long guess leaves trailing silence.
 * Shared by `voice` (TTS) and the record/import paths.
 */
export function attachAudio(scene: Scene, path: string, durationMs: number): Scene {
  const slides =
    scene.slides.length === 1 && scene.slides[0]!.startMs === 0
      ? [{ ...scene.slides[0]!, durationMs: durationMs + NARRATION_TAIL_MS }]
      : scene.slides;
  return { ...scene, audio: { path, durationMs }, slides };
}

/**
 * Re-tile a scene's slides so they fill `[0, total]` contiguously in order,
 * preserving their relative proportions (an even split when they have no extent
 * yet). Used pre-audio by `plan` (to lay out a multi-slide scene across the
 * narration estimate) and by `script` (to re-fit after the estimate changes), so
 * a multi-slide scene always renders gap-free before `cut` snaps the boundaries
 * onto emphasis beats. Single-slide scenes collapse to the whole span.
 */
export function fitSlidesToDuration<T extends { startMs: number; durationMs: number }>(
  slides: T[],
  total: number,
): T[] {
  const n = slides.length;
  if (n === 0 || total <= 0) return slides;
  if (n === 1) return [{ ...slides[0]!, startMs: 0, durationMs: total }];

  const end = Math.max(...slides.map((s) => s.startMs + s.durationMs), 0);
  const fracStart = (i: number) => (end > 0 ? slides[i]!.startMs / end : i / n);

  // Build strictly-increasing edges, reserving ≥1ms for every remaining slide.
  const edges: number[] = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const raw = i === 0 ? 0 : Math.round(fracStart(i) * total);
    const e = Math.min(Math.max(raw, prev + 1), total - (n - i));
    edges.push(e);
    prev = e;
  }
  edges.push(total);
  return slides.map((s, i) => ({ ...s, startMs: edges[i]!, durationMs: Math.max(1, edges[i + 1]! - edges[i]!) }));
}

/**
 * A rough spoken-duration estimate for narration, used by `plan` to size slides
 * before any audio exists (so the project renders immediately). ~150 wpm with a
 * small floor and tail padding. Replaced by the real measured duration once
 * `voice` runs.
 */
export function estimateNarrationMs(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const ms = (words / 150) * 60_000;
  return Math.max(2500, Math.round(ms) + 600);
}
