import type { Project } from "./project";
import type { Scene } from "./scene";

/**
 * Beat tags that trigger a cut to the next slide. `slide-change` is the explicit
 * marker; `emphasis` and `punchline` double as cut points so a visual change
 * lands on the spoken peak (the "cuts on emphasis" behaviour).
 */
export const CUT_BEAT_TAGS = ["slide-change", "emphasis", "punchline"] as const;

/** Convert milliseconds to a whole frame count at the given fps. */
export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

/** Convert a frame index to milliseconds at the given fps. */
export function framesToMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

/**
 * The intrinsic duration of a scene in ms: long enough to cover both its
 * narration audio and the latest-ending slide. A scene with neither is zero.
 */
export function sceneDurationMs(scene: Scene): number {
  const audioMs = scene.audio?.durationMs ?? 0;
  const slidesMs = scene.slides.reduce(
    (max, s) => Math.max(max, s.startMs + s.durationMs),
    0,
  );
  return Math.max(audioMs, slidesMs);
}

/**
 * The overlap (in ms) that a scene's outgoing transition steals from the
 * following scene's start. A "cut" has no overlap; "fade"/"slide" crossfade for
 * `durationMs`, capped so it can't exceed either neighbouring scene's length.
 */
export function transitionOverlapMs(scene: Scene, next: Scene): number {
  if (scene.transition.type === "cut") return 0;
  const cap = Math.min(sceneDurationMs(scene), sceneDurationMs(next));
  return Math.min(scene.transition.durationMs, cap);
}

export type SceneTiming = {
  scene: Scene;
  index: number;
  startMs: number;
  durationMs: number;
  /** Overlap with the *next* scene; 0 for the last scene or a cut. */
  outgoingOverlapMs: number;
};

/**
 * Lay every scene onto an absolute ms timeline, collapsing crossfade overlaps so
 * scene N+1 begins `overlap` ms before scene N ends. This is the single source
 * of truth for where each <Sequence> is placed in the render.
 */
export function layoutTimeline(project: Project): SceneTiming[] {
  const scenes = project.scenes;
  const timings: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const duration = sceneDurationMs(scene);
    const next = scenes[i + 1];
    const overlap = next ? transitionOverlapMs(scene, next) : 0;
    timings.push({
      scene,
      index: i,
      startMs: cursor,
      durationMs: duration,
      outgoingOverlapMs: overlap,
    });
    cursor += duration - overlap;
  }
  return timings;
}

/** Total composition duration in ms after collapsing transition overlaps. */
export function totalDurationMs(project: Project): number {
  const timings = layoutTimeline(project);
  if (timings.length === 0) return 0;
  const last = timings[timings.length - 1]!;
  return last.startMs + last.durationMs;
}

/** Total composition duration in whole frames — what Remotion needs. */
export function totalDurationFrames(project: Project): number {
  return msToFrames(totalDurationMs(project), project.meta.fps);
}

/** A span of the absolute timeline (in ms) during which narration is audible. */
export type NarrationInterval = { startMs: number; endMs: number };

/**
 * The absolute-timeline spans where a scene's narration audio is playing. Each
 * scene mounts its audio at its own start (scene-relative frame 0), so the span
 * is `[startMs, startMs + audio.durationMs]`. Scenes without audio contribute
 * nothing. Spans may overlap across a crossfade — callers treating "any span
 * active" as ducked handle that correctly. Used to duck background music.
 */
export function narrationIntervalsMs(project: Project): NarrationInterval[] {
  const intervals: NarrationInterval[] = [];
  for (const t of layoutTimeline(project)) {
    const audioMs = t.scene.audio?.durationMs ?? 0;
    if (audioMs > 0) intervals.push({ startMs: t.startMs, endMs: t.startMs + audioMs });
  }
  return intervals;
}

/**
 * Background-music volume at a given frame, ducked under narration. Returns
 * `base` in narration-free gaps and ramps toward `duckTo` while narration plays,
 * easing over `rampMs` on each side of every interval so the level glides rather
 * than clicks. The duck begins `rampMs` *before* speech so music is already low
 * when the voice starts, and recovers over `rampMs` after it ends.
 */
export function musicVolumeAt(params: {
  frame: number;
  fps: number;
  intervals: NarrationInterval[];
  base: number;
  duckTo: number;
  rampMs?: number;
}): number {
  const { frame, fps, intervals, base, duckTo, rampMs = 150 } = params;
  const tMs = framesToMs(frame, fps);
  const ramp = Math.max(1, rampMs);

  // How fully ducked we are (0 = base, 1 = duckTo), taking the strongest duck
  // across all intervals so overlapping narration never un-ducks.
  let duck = 0;
  for (const { startMs, endMs } of intervals) {
    let f: number;
    if (tMs <= startMs - ramp || tMs >= endMs + ramp) f = 0;
    else if (tMs >= startMs && tMs <= endMs) f = 1;
    else if (tMs < startMs) f = (tMs - (startMs - ramp)) / ramp; // ramping down
    else f = ((endMs + ramp) - tMs) / ramp; // ramping back up
    if (f > duck) duck = f;
    if (duck >= 1) break;
  }
  return base + (duckTo - base) * duck;
}

/**
 * Sorted, de-duplicated cut-beat times (ms) strictly inside `(0, total)`. Beats
 * outside the scene span — e.g. estimate-space beats that overshoot a shorter
 * measured audio — are dropped, and near-coincident beats are collapsed so two
 * cuts can't land on the same frame.
 */
export function cutTimesMs(scene: Scene, total: number): number[] {
  const tags = new Set<string>(CUT_BEAT_TAGS);
  const sorted = scene.beats
    .filter((b) => tags.has(b.tag))
    .map((b) => b.tMs)
    .filter((t) => t > 0 && t < total)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length === 0 || t - out[out.length - 1]! >= 1) out.push(t);
  }
  return out;
}

/**
 * Pick `gaps` increasing boundary times for slide cuts from the available cut
 * beats. Exactly enough beats → use them as-is. More beats than gaps → spread the
 * choice evenly across the beats so changes aren't all bunched at the start.
 * Fewer beats than gaps → keep the beats and divide the leftover time evenly. The
 * result is always strictly increasing and inside `(0, total)`.
 */
function chooseBoundaries(cuts: number[], gaps: number, total: number): number[] {
  if (gaps <= 0) return [];
  let raw: number[];
  if (cuts.length === gaps) {
    raw = cuts.slice();
  } else if (cuts.length > gaps) {
    raw = [];
    for (let i = 1; i <= gaps; i++) {
      const idx = Math.round((i * (cuts.length + 1)) / (gaps + 1)) - 1;
      raw.push(cuts[Math.min(Math.max(idx, 0), cuts.length - 1)]!);
    }
  } else {
    raw = cuts.slice();
    const start = raw.length ? raw[raw.length - 1]! : 0;
    const fill = gaps - raw.length;
    for (let i = 1; i <= fill; i++) raw.push(start + ((total - start) * i) / (fill + 1));
  }
  // Enforce strictly-increasing boundaries within (0, total).
  const out: number[] = [];
  let prev = 0;
  for (const x of raw) {
    const v = Math.min(Math.max(x, prev + 1), total - 1);
    out.push(v);
    prev = v;
  }
  return out;
}

/**
 * Distribute a scene's slides across its duration, cutting to the next slide at
 * `emphasis`/`punchline`/`slide-change` beats. Slides keep their order and
 * content; only `startMs`/`durationMs` change so that boundaries snap to beats
 * and the slides tile the whole scene with no gaps or overlaps. A scene with 0–1
 * slides or no usable span is returned unchanged (nothing to cut between).
 */
export function applyEmphasisCuts(scene: Scene): Scene {
  const n = scene.slides.length;
  if (n <= 1) return scene;
  const total = sceneDurationMs(scene);
  if (total <= 0) return scene;

  const boundaries = chooseBoundaries(cutTimesMs(scene, total), n - 1, total);
  const edges = [0, ...boundaries, total];
  const slides = scene.slides.map((s, i) => ({
    ...s,
    startMs: Math.round(edges[i]!),
    durationMs: Math.max(1, Math.round(edges[i + 1]! - edges[i]!)),
  }));
  return { ...scene, slides };
}
