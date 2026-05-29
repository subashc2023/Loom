import { describe, expect, test } from "bun:test";
import {
  applyEmphasisCuts,
  cutTimesMs,
  defaultKenBurns,
  IMPLEMENTED_LAYOUTS,
  layoutTimeline,
  msToFrames,
  musicVolumeAt,
  narrationIntervalsMs,
  parseProject,
  resolveMotion,
  safeParseProject,
  sceneDurationMs,
  totalDurationFrames,
  totalDurationMs,
} from "./index";
import type { Scene } from "./scene";

describe("parseProject defaults", () => {
  test("a minimal project fills in sane defaults", () => {
    const p = parseProject({ id: "demo" });
    expect(p.schemaVersion).toBe(1);
    expect(p.meta.aspectRatio).toBe("16:9");
    expect(p.meta.fps).toBe(30);
    expect(p.meta.resolution).toEqual([1920, 1080]);
    expect(p.style.palette.bg).toBe("#0a0a0a");
    expect(p.scenes).toEqual([]);
  });

  test("scene transition defaults to a 200ms fade", () => {
    const p = parseProject({
      id: "demo",
      scenes: [{ id: "s1", script: "hi" }],
    });
    expect(p.scenes[0]!.transition).toEqual({ type: "fade", durationMs: 200 });
  });

  test("captions default on, scene captions default empty", () => {
    const p = parseProject({ id: "demo", scenes: [{ id: "s1", script: "hi" }] });
    expect(p.style.captions).toBe(true);
    expect(p.scenes[0]!.captions).toEqual([]);
  });

  test("auto Ken Burns defaults on", () => {
    const p = parseProject({ id: "demo" });
    expect(p.style.kenBurns).toBe(true);
  });

  test("caption words parse with scene-relative timing", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "hello world",
          captions: [
            { text: "hello", startMs: 0, endMs: 400 },
            { text: "world", startMs: 420, endMs: 900 },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.scenes[0]!.captions).toHaveLength(2);
      expect(res.project.scenes[0]!.captions[1]!.text).toBe("world");
    }
  });
});

describe("slide discriminated union", () => {
  test("title slide validates and applies content", () => {
    const p = parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "title",
              startMs: 0,
              durationMs: 3000,
              content: { title: "Hello", subtitle: "world" },
            },
          ],
        },
      ],
    });
    const slide = p.scenes[0]!.slides[0]!;
    expect(slide.layout).toBe("title");
    if (slide.layout === "title") expect(slide.content.title).toBe("Hello");
  });

  test("image slide defaults fit to cover", () => {
    const p = parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "image",
              startMs: 0,
              durationMs: 3000,
              content: { src: "assets/images/a.png" },
            },
          ],
        },
      ],
    });
    const slide = p.scenes[0]!.slides[0]!;
    if (slide.layout === "image") expect(slide.content.fit).toBe("cover");
  });

  test("an image slide may be a brief: prompt, no src yet", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "image",
              startMs: 0,
              durationMs: 3000,
              content: { prompt: "a neon city at dusk" },
            },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slide = res.project.scenes[0]!.slides[0]!;
      if (slide.layout === "image") {
        expect(slide.content.src).toBeUndefined();
        expect(slide.content.prompt).toBe("a neon city at dusk");
      }
    }
  });

  test("wrong content for a layout is rejected", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            { id: "sl1", layout: "title", startMs: 0, durationMs: 1000, content: { subtitle: "no title" } },
          ],
        },
      ],
    });
    expect(res.ok).toBe(false);
  });

  test("a bullets slide parses and needs at least one item", () => {
    const ok = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "bullets",
              startMs: 0,
              durationMs: 3000,
              content: { title: "Pipeline", items: ["plan", "script", "voice"] },
            },
          ],
        },
      ],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const slide = ok.project.scenes[0]!.slides[0]!;
      if (slide.layout === "bullets") expect(slide.content.items).toHaveLength(3);
    }

    // An empty items array is rejected (.min(1)).
    const empty = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            { id: "sl1", layout: "bullets", startMs: 0, durationMs: 3000, content: { items: [] } },
          ],
        },
      ],
    });
    expect(empty.ok).toBe(false);
  });

  test("a quote slide parses with optional attribution", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "quote",
              startMs: 0,
              durationMs: 3000,
              content: { text: "Everything is derived from the spec." },
            },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slide = res.project.scenes[0]!.slides[0]!;
      if (slide.layout === "quote") expect(slide.content.attribution).toBeUndefined();
    }
  });

  test("a code slide parses with optional language/title/highlight", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "code",
              startMs: 0,
              durationMs: 3000,
              content: { code: "const x = 1;", language: "ts", title: "a.ts", highlight: [1] },
            },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slide = res.project.scenes[0]!.slides[0]!;
      if (slide.layout === "code") {
        expect(slide.content.language).toBe("ts");
        expect(slide.content.highlight).toEqual([1]);
      }
    }

    // Empty code is rejected (.min(1)); a non-positive highlight line is rejected.
    expect(
      safeParseProject({
        id: "demo",
        scenes: [
          {
            id: "s1",
            script: "",
            slides: [{ id: "sl1", layout: "code", startMs: 0, durationMs: 3000, content: { code: "" } }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      safeParseProject({
        id: "demo",
        scenes: [
          {
            id: "s1",
            script: "",
            slides: [
              { id: "sl1", layout: "code", startMs: 0, durationMs: 3000, content: { code: "x", highlight: [0] } },
            ],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  test("a manim slide parses as a brief (sceneName only) or with a clip/source", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            {
              id: "sl1",
              layout: "manim",
              startMs: 0,
              durationMs: 3000,
              content: { sceneName: "Intro", sceneSource: "class Intro(Scene): pass" },
            },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slide = res.project.scenes[0]!.slides[0]!;
      if (slide.layout === "manim") {
        expect(slide.content.sceneName).toBe("Intro");
        expect(slide.content.clip).toBeUndefined();
      }
    }

    // An empty sceneName is rejected (.min(1)).
    expect(
      safeParseProject({
        id: "demo",
        scenes: [
          {
            id: "s1",
            script: "",
            slides: [{ id: "sl1", layout: "manim", startMs: 0, durationMs: 3000, content: { sceneName: "" } }],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  test("bullets, quote, code, and manim are marked implemented", () => {
    expect(IMPLEMENTED_LAYOUTS).toContain("bullets");
    expect(IMPLEMENTED_LAYOUTS).toContain("quote");
    expect(IMPLEMENTED_LAYOUTS).toContain("code");
    expect(IMPLEMENTED_LAYOUTS).toContain("manim");
  });

  test("absolute asset paths are rejected", () => {
    const res = safeParseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          slides: [
            { id: "sl1", layout: "image", startMs: 0, durationMs: 1000, content: { src: "/etc/passwd" } },
          ],
        },
      ],
    });
    expect(res.ok).toBe(false);
  });
});

describe("timing", () => {
  test("msToFrames rounds to whole frames", () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(33, 30)).toBe(1);
    expect(msToFrames(16, 30)).toBe(0);
  });

  test("scene duration is the max of audio and slide extents", () => {
    const p = parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          audio: { path: "assets/audio/s1.mp3", durationMs: 4000 },
          slides: [
            { id: "sl1", layout: "title", startMs: 0, durationMs: 5000, content: { title: "x" } },
          ],
        },
      ],
    });
    expect(sceneDurationMs(p.scenes[0]!)).toBe(5000);
  });

  test("crossfade overlap collapses the timeline", () => {
    const p = parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          audio: { path: "assets/audio/s1.mp3", durationMs: 3000 },
          transition: { type: "fade", durationMs: 200 },
          slides: [],
        },
        {
          id: "s2",
          script: "",
          audio: { path: "assets/audio/s2.mp3", durationMs: 3000 },
          transition: { type: "cut", durationMs: 0 },
          slides: [],
        },
      ],
    });
    const timeline = layoutTimeline(p);
    expect(timeline[0]!.startMs).toBe(0);
    // scene 2 starts 200ms early because of the fade
    expect(timeline[1]!.startMs).toBe(2800);
    // total = 2800 + 3000
    expect(totalDurationMs(p)).toBe(5800);
    expect(totalDurationFrames(p)).toBe(msToFrames(5800, 30));
  });

  test("a cut transition produces no overlap", () => {
    const p = parseProject({
      id: "demo",
      scenes: [
        { id: "s1", script: "", audio: { path: "assets/audio/s1.mp3", durationMs: 2000 }, transition: { type: "cut", durationMs: 0 }, slides: [] },
        { id: "s2", script: "", audio: { path: "assets/audio/s2.mp3", durationMs: 2000 }, slides: [] },
      ],
    });
    expect(totalDurationMs(p)).toBe(4000);
  });
});

describe("Ken Burns motion resolution", () => {
  const explicitKb = { type: "kenBurns", from: { x: 0, y: 0, width: 1, height: 1 }, to: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } } as const;

  test("an explicit motion always wins, even when auto-motion is on", () => {
    expect(resolveMotion(explicitKb, true, "sl1")).toEqual(explicitKb);
  });

  test("an explicit none is honoured as an opt-out", () => {
    expect(resolveMotion({ type: "none" }, true, "sl1")).toEqual({ type: "none" });
  });

  test("no motion + auto-motion on → a gentle default Ken Burns", () => {
    const m = resolveMotion(undefined, true, "sl1");
    expect(m.type).toBe("kenBurns");
  });

  test("no motion + auto-motion off → static", () => {
    expect(resolveMotion(undefined, false, "sl1")).toEqual({ type: "none" });
  });

  test("default selection is deterministic per seed", () => {
    expect(defaultKenBurns("s2-image")).toEqual(defaultKenBurns("s2-image"));
  });
});

describe("music ducking", () => {
  // s1: narration 0..2000ms, cut; s2: narration 2000..4000ms. Plus a trailing
  // slide-only scene with no audio (contributes no narration span).
  const project = parseProject({
    id: "demo",
    music: { track: "assets/music/bg.mp3", volume: 0.4, duckTo: 0.05 },
    scenes: [
      { id: "s1", script: "", audio: { path: "assets/audio/s1.mp3", durationMs: 2000 }, transition: { type: "cut", durationMs: 0 }, slides: [] },
      { id: "s2", script: "", audio: { path: "assets/audio/s2.mp3", durationMs: 2000 }, transition: { type: "cut", durationMs: 0 }, slides: [] },
      { id: "s3", script: "", slides: [{ id: "sl1", layout: "title", startMs: 0, durationMs: 1000, content: { title: "end" } }] },
    ],
  });

  test("only scenes with audio contribute narration spans", () => {
    expect(narrationIntervalsMs(project)).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 2000, endMs: 4000 },
    ]);
  });

  const intervals = narrationIntervalsMs(project);
  const vol = (ms: number) =>
    musicVolumeAt({ frame: msToFrames(ms, 30), fps: 30, intervals, base: 0.4, duckTo: 0.05, rampMs: 150 });

  test("fully ducked while narration plays", () => {
    expect(vol(1000)).toBeCloseTo(0.05, 5);
    expect(vol(3000)).toBeCloseTo(0.05, 5);
  });

  test("back to base in a narration-free gap", () => {
    // 5000ms is past all narration (last span ends at 4000, +150ms ramp).
    expect(vol(5000)).toBeCloseTo(0.4, 5);
  });

  test("ramps between base and ducked at an interval edge", () => {
    // ~75ms before narration starts: halfway down the 150ms ramp.
    const mid = vol(-75 + 0);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.4);
  });

  test("no music params still yields a usable number (empty intervals → base)", () => {
    expect(musicVolumeAt({ frame: 30, fps: 30, intervals: [], base: 0.3, duckTo: 0.1 })).toBeCloseTo(0.3, 5);
  });
});

describe("cuts on emphasis", () => {
  // A 3-slide scene with 12s of audio. Build via parseProject so defaults fill in.
  const sceneWith = (beats: { tMs: number; tag: string }[]): Scene =>
    parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          audio: { path: "assets/audio/s1.mp3", durationMs: 12000 },
          beats,
          slides: [
            { id: "a", layout: "title", startMs: 0, durationMs: 1000, content: { title: "a" } },
            { id: "b", layout: "title", startMs: 0, durationMs: 1000, content: { title: "b" } },
            { id: "c", layout: "title", startMs: 0, durationMs: 1000, content: { title: "c" } },
          ],
        },
      ],
    }).scenes[0]!;

  test("cutTimesMs keeps only in-range cut beats, sorted and de-duped", () => {
    const scene = sceneWith([
      { tMs: 8000, tag: "punchline" },
      { tMs: 3000, tag: "emphasis" },
      { tMs: 3000, tag: "slide-change" }, // duplicate time collapses
      { tMs: 5000, tag: "pause" }, // not a cut tag → ignored
      { tMs: 20000, tag: "emphasis" }, // out of range → dropped
      { tMs: 0, tag: "emphasis" }, // boundary → dropped (must be > 0)
    ]);
    expect(cutTimesMs(scene, sceneDurationMs(scene))).toEqual([3000, 8000]);
  });

  test("slides snap to the cut beats and tile the whole scene", () => {
    const scene = sceneWith([
      { tMs: 3000, tag: "emphasis" },
      { tMs: 8000, tag: "punchline" },
    ]);
    const out = applyEmphasisCuts(scene);
    expect(out.slides.map((s) => [s.startMs, s.durationMs])).toEqual([
      [0, 3000],
      [3000, 5000],
      [8000, 4000],
    ]);
    // Content/order untouched.
    expect(out.slides.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("more cut beats than gaps: choices spread across the beats", () => {
    const scene = sceneWith([
      { tMs: 1000, tag: "emphasis" },
      { tMs: 5000, tag: "emphasis" },
      { tMs: 9000, tag: "emphasis" },
    ]);
    // 3 slides → 2 gaps; with 3 beats it should not bunch both at the start.
    const b = applyEmphasisCuts(scene).slides.map((s) => s.startMs);
    expect(b[0]).toBe(0);
    expect(b[1]).toBeGreaterThan(0);
    expect(b[2]).toBeGreaterThan(b[1]!);
    expect(b[2]).toBeLessThan(12000);
  });

  test("fewer cut beats than gaps: leftover time is divided evenly", () => {
    const scene = sceneWith([{ tMs: 3000, tag: "emphasis" }]); // 1 beat, 2 gaps
    const out = applyEmphasisCuts(scene);
    expect(out.slides[0]!.startMs).toBe(0);
    expect(out.slides[1]!.startMs).toBe(3000); // the beat
    // remaining span 3000..12000 split once → boundary at 7500
    expect(out.slides[2]!.startMs).toBe(7500);
  });

  test("no cut beats: slides are spaced evenly across the scene", () => {
    const scene = sceneWith([]);
    const starts = applyEmphasisCuts(scene).slides.map((s) => s.startMs);
    expect(starts).toEqual([0, 4000, 8000]);
  });

  test("boundaries stay strictly increasing even with clustered beats", () => {
    const scene = sceneWith([
      { tMs: 5000, tag: "emphasis" },
      { tMs: 5000, tag: "punchline" }, // same instant
    ]);
    const starts = applyEmphasisCuts(scene).slides.map((s) => s.startMs);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
  });

  test("a single-slide scene is returned unchanged", () => {
    const scene = parseProject({
      id: "demo",
      scenes: [
        {
          id: "s1",
          script: "",
          audio: { path: "a.mp3", durationMs: 5000 },
          beats: [{ tMs: 2000, tag: "emphasis" }],
          slides: [{ id: "only", layout: "title", startMs: 0, durationMs: 1000, content: { title: "x" } }],
        },
      ],
    }).scenes[0]!;
    expect(applyEmphasisCuts(scene)).toEqual(scene);
  });
});
