import { describe, expect, test } from "bun:test";
import { parseProject } from "@loom/spec";
import { applyCuts } from "./cut";

const project = parseProject({
  id: "demo",
  scenes: [
    {
      id: "s1",
      script: "",
      audio: { path: "a.mp3", durationMs: 10000 },
      beats: [{ tMs: 4000, tag: "emphasis" }],
      slides: [
        { id: "a", layout: "title", startMs: 0, durationMs: 1000, content: { title: "a" } },
        { id: "b", layout: "title", startMs: 0, durationMs: 1000, content: { title: "b" } },
      ],
    },
    {
      id: "s2",
      script: "",
      audio: { path: "b.mp3", durationMs: 5000 },
      slides: [{ id: "only", layout: "title", startMs: 0, durationMs: 1000, content: { title: "x" } }],
    },
  ],
});

describe("applyCuts", () => {
  test("re-times multi-slide scenes and skips single-slide ones", () => {
    const { project: updated, results } = applyCuts(project);
    expect(results).toEqual([
      { sceneId: "s1", slides: 2, cuts: 1, status: "cut" },
      { sceneId: "s2", slides: 1, cuts: 0, status: "skipped" },
    ]);
    // s1's slides now snap to the emphasis beat at 4000ms.
    expect(updated.scenes[0]!.slides.map((s) => [s.startMs, s.durationMs])).toEqual([
      [0, 4000],
      [4000, 6000],
    ]);
    // s2 untouched.
    expect(updated.scenes[1]!.slides[0]!.durationMs).toBe(1000);
  });

  test("--scene limits the pass to one scene", () => {
    const { results } = applyCuts(project, { sceneId: "s1" });
    expect(results).toEqual([{ sceneId: "s1", slides: 2, cuts: 1, status: "cut" }]);
  });

  test("an unknown scene id is rejected", () => {
    expect(() => applyCuts(project, { sceneId: "nope" })).toThrow(/no scene with id/);
  });
});
