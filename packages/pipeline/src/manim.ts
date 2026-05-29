import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, Scene, Slide } from "@loom/spec";
import { probeDurationMs } from "./audio";
import { PipelineError } from "./errors";
import { clipRelPath, manimArgs, mediaDirRel, producedClipSubpath, sourceRelPath } from "./manim-cli";

/**
 * `manim` — render the Manim scene behind each `manim` slide into a clip and fill
 * in its `clip`. A key-free, local-toolchain stage (it shells out to the `manim`
 * binary, like `record`/`voice` shell out to ffmpeg). The slide carries the scene
 * to run inline as `sceneSource` plus the `sceneName` to render; we write the
 * source to assets/manim/<slideId>.py, run Manim at the project's resolution/fps,
 * copy the produced mp4 to assets/manim/<slideId>.mp4, and measure it so the
 * slide's `durationMs` matches the animation's natural length.
 *
 * Idempotent: slides that already have a `clip` are skipped unless `reroll`. A
 * slide with neither a clip nor `sceneSource` has nothing to render ("no-source").
 */

type ManimSlide = Extract<Slide, { layout: "manim" }>;

export type ManimResult = {
  slideId: string;
  sceneId: string;
  status: "rendered" | "skipped" | "no-source";
  path?: string;
  durationMs?: number;
};

export type ManimOptions = {
  sceneId?: string;
  slideId?: string;
  reroll?: boolean;
  /** Override the manim executable (default: "manim"). */
  bin?: string;
};

export function renderManim(
  project: Project,
  root: string,
  opts: ManimOptions = {},
): { project: Project; results: ManimResult[] } {
  if (opts.sceneId && !project.scenes.some((s) => s.id === opts.sceneId)) {
    throw new PipelineError(`no scene with id "${opts.sceneId}" in this project.`);
  }

  const [width, height] = project.meta.resolution;
  const fps = project.meta.fps;
  const bin = opts.bin ?? "manim";

  const results: ManimResult[] = [];
  const scenes: Scene[] = project.scenes.map((scene) => {
    if (opts.sceneId && scene.id !== opts.sceneId) return scene;
    const slides = scene.slides.map((slide) => {
      const handled = maybeRender(slide, scene.id, { root, width, height, fps, bin, opts });
      if (handled.result) results.push(handled.result);
      return handled.slide;
    });
    return { ...scene, slides };
  });

  if (opts.slideId && !results.some((r) => r.slideId === opts.slideId)) {
    throw new PipelineError(`no manim slide with id "${opts.slideId}" found (in the selected scope).`);
  }

  return { project: { ...project, scenes }, results };
}

function maybeRender(
  slide: Slide,
  sceneId: string,
  ctx: {
    root: string;
    width: number;
    height: number;
    fps: number;
    bin: string;
    opts: ManimOptions;
  },
): { slide: Slide; result?: ManimResult } {
  if (slide.layout !== "manim") return { slide };
  if (ctx.opts.slideId && slide.id !== ctx.opts.slideId) return { slide };

  const m = slide as ManimSlide;
  if (m.content.clip && !ctx.opts.reroll) {
    return { slide, result: { slideId: slide.id, sceneId, status: "skipped" } };
  }
  if (!m.content.sceneSource) {
    return { slide, result: { slideId: slide.id, sceneId, status: "no-source" } };
  }

  const clipRel = renderClip(ctx.root, slide.id, m.content.sceneSource, m.content.sceneName, ctx);
  const durationMs = probeDurationMs(join(ctx.root, clipRel));

  const next = { ...slide, durationMs, content: { ...m.content, clip: clipRel } } as Slide;
  return { slide: next, result: { slideId: slide.id, sceneId, status: "rendered", path: clipRel, durationMs } };
}

/** Write the scene source, run Manim, and copy the produced mp4 to its canonical slot. */
function renderClip(
  root: string,
  slideId: string,
  sceneSource: string,
  sceneName: string,
  ctx: { width: number; height: number; fps: number; bin: string },
): string {
  mkdirSync(join(root, "assets", "manim"), { recursive: true });

  const sourceRel = sourceRelPath(slideId);
  writeFileSync(join(root, sourceRel), sceneSource);

  const mediaRel = mediaDirRel(slideId);
  const mediaAbs = join(root, mediaRel);
  rmSync(mediaAbs, { recursive: true, force: true }); // drop any stale render tree

  const args = manimArgs({
    sceneFile: sourceRel,
    sceneName,
    mediaDir: mediaRel,
    width: ctx.width,
    height: ctx.height,
    fps: ctx.fps,
  });
  const res = spawnSync(ctx.bin, args, { cwd: root, encoding: "utf8" });
  if (res.error) {
    const e = res.error as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new PipelineError(
        `"${ctx.bin}" not found on PATH. Install Manim Community (https://docs.manim.community/en/stable/installation.html), ` +
          "e.g. `pip install manim`, or pass a different executable.",
      );
    }
    throw new PipelineError(`could not run "${ctx.bin}" (${e.message}).`);
  }
  if (res.status !== 0) {
    throw new PipelineError(
      `manim failed to render scene "${sceneName}" (exit ${res.status}):\n${(res.stderr ?? "").trim().slice(-800)}`,
    );
  }

  const produced = locateProduced(mediaAbs, sourceRel, sceneName, ctx.height, ctx.fps);
  if (!produced) {
    throw new PipelineError(
      `manim reported success but no .mp4 was found under ${mediaRel} for scene "${sceneName}".`,
    );
  }

  const clipRel = clipRelPath(slideId);
  copyFileSync(produced, join(root, clipRel));
  rmSync(mediaAbs, { recursive: true, force: true }); // the canonical clip is all we keep
  return clipRel;
}

/**
 * Find the rendered clip under the media dir. Tries the predicted nested path
 * first, then falls back to walking the `videos/` tree for a matching (or the
 * sole) mp4 — Manim's folder naming can vary slightly across versions.
 */
function locateProduced(
  mediaAbs: string,
  sourceRel: string,
  sceneName: string,
  height: number,
  fps: number,
): string | undefined {
  const predicted = join(mediaAbs, producedClipSubpath(sourceRel, sceneName, height, fps));
  if (existsSync(predicted)) return predicted;

  const videos = join(mediaAbs, "videos");
  if (!existsSync(videos)) return undefined;
  const mp4s = walkMp4s(videos);
  return mp4s.find((p) => p.endsWith(`${sceneName}.mp4`)) ?? (mp4s.length === 1 ? mp4s[0] : undefined);
}

/** Recursively collect every .mp4 path under `dir`. */
function walkMp4s(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMp4s(full));
    else if (entry.name.toLowerCase().endsWith(".mp4")) out.push(full);
  }
  return out;
}
