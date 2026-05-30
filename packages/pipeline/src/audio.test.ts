import { describe, expect, test } from "bun:test";
import { parseProject } from "@loom/spec";
import { attachAudio, estimateNarrationMs, fitSlidesToDuration, NARRATION_TAIL_MS } from "./audio";

/** Build a one-scene project and hand back the scene, so we exercise real Scene shapes. */
function sceneWith(slides: unknown[]) {
  const p = parseProject({ id: "demo", scenes: [{ id: "s1", script: "hi there", slides }] });
  return p.scenes[0]!;
}

describe("attachAudio", () => {
  test("fits a single full-scene slide to the audio plus one tail beat", () => {
    const scene = sceneWith([{ id: "s1-1", layout: "title", startMs: 0, durationMs: 3000, content: { title: "Hi" } }]);
    const out = attachAudio(scene, "assets/audio/s1.mp3", 8127);
    expect(out.audio).toEqual({ path: "assets/audio/s1.mp3", durationMs: 8127 });
    expect(out.slides[0]!.durationMs).toBe(8127 + NARRATION_TAIL_MS);
  });

  test("SHRINKS an over-long estimated slide down to the real audio (the gap regression)", () => {
    // 9800ms was a pre-audio estimate; the real narration is only 8127ms. Before the
    // fix, Math.max kept 9800 → ~1.7s of trailing silence. Now it follows the audio.
    const scene = sceneWith([{ id: "s1-1", layout: "title", startMs: 0, durationMs: 9800, content: { title: "Hi" } }]);
    const out = attachAudio(scene, "assets/audio/s1.mp3", 8127);
    expect(out.slides[0]!.durationMs).toBe(8127 + NARRATION_TAIL_MS);
    expect(out.slides[0]!.durationMs).toBeLessThan(9800);
  });

  test("leaves multi-slide scenes' slide timings untouched (only attaches audio)", () => {
    const scene = sceneWith([
      { id: "s1-1", layout: "title", startMs: 0, durationMs: 3000, content: { title: "A" } },
      { id: "s1-2", layout: "title", startMs: 3000, durationMs: 3000, content: { title: "B" } },
    ]);
    const out = attachAudio(scene, "assets/audio/s1.mp3", 8000);
    expect(out.slides.map((s) => s.durationMs)).toEqual([3000, 3000]);
    expect(out.audio?.durationMs).toBe(8000);
  });

  test("does not stretch a lone slide that doesn't start at 0", () => {
    const scene = sceneWith([{ id: "s1-1", layout: "title", startMs: 500, durationMs: 3000, content: { title: "Hi" } }]);
    const out = attachAudio(scene, "assets/audio/s1.mp3", 8000);
    expect(out.slides[0]!.durationMs).toBe(3000);
  });
});

describe("fitSlidesToDuration", () => {
  const slide = (id: string, startMs: number, durationMs: number) => ({ id, startMs, durationMs });

  test("collapses a single slide to the whole span", () => {
    expect(fitSlidesToDuration([slide("a", 0, 10)], 5000)).toEqual([{ id: "a", startMs: 0, durationMs: 5000 }]);
  });

  test("evenly tiles slides that have no extent yet", () => {
    const out = fitSlidesToDuration([slide("a", 0, 0), slide("b", 0, 0), slide("c", 0, 0)], 3000);
    expect(out.map((s) => s.startMs)).toEqual([0, 1000, 2000]);
    expect(out.map((s) => s.durationMs)).toEqual([1000, 1000, 1000]);
  });

  test("produces a gap-free, strictly-increasing tiling that fills the span", () => {
    const out = fitSlidesToDuration([slide("a", 0, 1000), slide("b", 1000, 3000)], 8000);
    expect(out[0]!.startMs).toBe(0);
    expect(out[1]!.startMs).toBe(out[0]!.startMs + out[0]!.durationMs); // contiguous
    expect(out[1]!.startMs + out[1]!.durationMs).toBe(8000); // fills the span
    // Proportions are preserved: 'a' took 1/4 of the original span.
    expect(out[0]!.durationMs).toBe(2000);
  });

  test("returns slides untouched for a non-positive total", () => {
    const slides = [slide("a", 0, 100)];
    expect(fitSlidesToDuration(slides, 0)).toBe(slides);
  });

  test("preserves non-timing fields", () => {
    const out = fitSlidesToDuration([{ id: "a", startMs: 0, durationMs: 0, layout: "title" }], 2000);
    expect(out[0]).toMatchObject({ id: "a", layout: "title", startMs: 0, durationMs: 2000 });
  });
});

describe("estimateNarrationMs", () => {
  test("scales with word count and has a floor", () => {
    expect(estimateNarrationMs("")).toBe(2500); // floor
    const short = estimateNarrationMs("one two three");
    const long = estimateNarrationMs("one two three four five six seven eight nine ten eleven twelve");
    expect(long).toBeGreaterThan(short);
  });
});
