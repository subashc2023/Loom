import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { totalDurationMs } from "@loom/spec";
import { log, c, fail } from "../log";
import { loadProject, resolveProjectRoot } from "../project-io";

export type Quality = "draft" | "final";

const QUALITY_OPTS: Record<Quality, { scale: number; crf: number; jpegQuality: number }> = {
  draft: { scale: 0.5, crf: 28, jpegQuality: 80 },
  final: { scale: 1, crf: 18, jpegQuality: 100 },
};

/**
 * Render the project's spec to an MP4. The renderer entry (@loom/render) is a
 * pure function of the spec; we bundle it once and pass the project as
 * inputProps, with publicDir pointed at the project root so staticFile() resolves
 * the project's own assets/ tree.
 */
export async function render(opts: {
  project?: string;
  quality?: Quality;
  out?: string;
  captions?: boolean;
}): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);
  const quality: Quality = opts.quality ?? "draft";

  // Per-render override of the project's caption setting, so a spec authored
  // with captions can be re-rendered clean (or vice versa) without editing it.
  if (opts.captions !== undefined && opts.captions !== project.style.captions) {
    project.style.captions = opts.captions;
    log.step(`captions ${opts.captions ? "on" : "off"} ${c.dim("(overriding the spec for this render)")}`);
  }

  if (totalDurationMs(project) <= 0) {
    fail("project has zero duration — add a scene with a slide or audio before rendering.");
  }

  const out = opts.out
    ? isAbsolute(opts.out)
      ? opts.out
      : resolve(root, opts.out)
    : join(root, "output", `${quality}.mp4`);
  mkdirSync(dirname(out), { recursive: true });

  const entry = fileURLToPath(import.meta.resolve("@loom/render"));

  log.step(`bundling renderer ${c.dim(`(${quality})`)}…`);
  const serveUrl = await bundle({
    entryPoint: entry,
    publicDir: root,
    onProgress: () => {},
  });

  const inputProps = { project };
  const composition = await selectComposition({ serveUrl, id: "LoomVideo", inputProps });

  log.step(
    `rendering ${c.bold(`${composition.width}×${composition.height}`)} · ${composition.durationInFrames} frames…`,
  );

  const q = QUALITY_OPTS[quality];
  let lastPct = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: out,
    inputProps,
    crf: q.crf,
    jpegQuality: q.jpegQuality,
    scale: q.scale,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        log.info(`  ${c.dim(`${pct}%`)}`);
      }
    },
  });

  log.ok(`rendered ${c.bold(out)}`);
}
