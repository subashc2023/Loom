import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProject } from "@loom/spec";
import { applyVariation, canonicalImageRelPath, setStyleReference, variantRelPath } from "./slides";

describe("slide variations", () => {
  test("variant + canonical paths are predictable", () => {
    expect(variantRelPath("s2-img", 3, "png")).toBe("assets/images/s2-img.v3.png");
    expect(canonicalImageRelPath("s2-img", "jpg")).toBe("assets/images/s2-img.jpg");
  });

  test("applyVariation copies the picked file to the canonical path and sets src", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-var-"));
    try {
      mkdirSync(join(root, "assets", "images"), { recursive: true });
      const picked = variantRelPath("s2-img", 2, "png");
      writeFileSync(join(root, picked), "fake-png-bytes");

      const project = parseProject({
        id: "demo",
        scenes: [
          {
            id: "s2",
            script: "",
            slides: [{ id: "s2-img", layout: "image", startMs: 0, durationMs: 3000, content: { prompt: "a city" } }],
          },
        ],
      });

      const { project: updated, result } = applyVariation(project, root, "s2-img", picked);

      const canon = canonicalImageRelPath("s2-img", "png");
      expect(result.path).toBe(canon);
      expect(existsSync(join(root, canon))).toBe(true);
      const slide = updated.scenes[0]!.slides[0]!;
      if (slide.layout === "image") expect(slide.content.src).toBe(canon);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("applyVariation rejects an unknown slide id", () => {
    const project = parseProject({ id: "demo", scenes: [] });
    expect(() => applyVariation(project, ".", "nope", "assets/images/nope.v1.png")).toThrow(/no slide with id/);
  });
});

describe("setStyleReference", () => {
  /** A project with one image slide whose image exists on disk, plus a title slide. */
  function projectWithImage(root: string) {
    mkdirSync(join(root, "assets", "images"), { recursive: true });
    writeFileSync(join(root, "assets", "images", "s2-img.png"), "fake-png-bytes");
    return parseProject({
      id: "demo",
      scenes: [
        { id: "s1", script: "", slides: [{ id: "s1-t", layout: "title", startMs: 0, durationMs: 3000, content: { title: "Hi" } }] },
        {
          id: "s2",
          script: "",
          slides: [{ id: "s2-img", layout: "image", startMs: 0, durationMs: 3000, content: { src: "assets/images/s2-img.png" } }],
        },
      ],
    });
  }

  test("adopts a slide's image: copies to assets/refs and sets slideReference", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-ref-"));
    try {
      const project = projectWithImage(root);
      const { project: updated, result } = setStyleReference(project, root, "s2-img");

      expect(result.reference).toBe("assets/refs/style-lock.png");
      expect(result.source).toContain("slide s2-img");
      expect(existsSync(join(root, "assets", "refs", "style-lock.png"))).toBe(true);
      expect(updated.style.slideReference).toBe("assets/refs/style-lock.png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("accepts a file path and copies it in", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-ref-"));
    try {
      const project = parseProject({ id: "demo", scenes: [] });
      const ref = join(root, "my-style.png");
      writeFileSync(ref, "fake-png-bytes");

      const { project: updated } = setStyleReference(project, root, ref);
      expect(updated.style.slideReference).toBe("assets/refs/style-lock.png");
      expect(existsSync(join(root, "assets", "refs", "style-lock.png"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a non-image slide", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-ref-"));
    try {
      expect(() => setStyleReference(projectWithImage(root), root, "s1-t")).toThrow(/title slide/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an image slide that has no image yet", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-ref-"));
    try {
      const project = parseProject({
        id: "demo",
        scenes: [{ id: "s2", script: "", slides: [{ id: "s2-img", layout: "image", startMs: 0, durationMs: 3000, content: { prompt: "a city" } }] }],
      });
      expect(() => setStyleReference(project, root, "s2-img")).toThrow(/no image yet/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a ref that is neither a slide id nor a file", () => {
    const root = mkdtempSync(join(tmpdir(), "loom-ref-"));
    try {
      expect(() => setStyleReference(projectWithImage(root), root, "nope")).toThrow(/neither a slide id/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
