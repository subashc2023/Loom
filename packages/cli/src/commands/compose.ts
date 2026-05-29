import { existsSync } from "node:fs";
import { join } from "node:path";
import { layoutTimeline, totalDurationFrames, totalDurationMs, type Project } from "@loom/spec";
import { log, c, fail } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * Validate the spec, normalize it (fill defaults) back to disk, verify every
 * referenced asset exists, and print the resolved timeline. This is the
 * "everything is consistent and renderable" gate before `loom render`.
 */
export function compose(opts: { project?: string; strict?: boolean }): void {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);

  // Re-save normalized (defaults materialized, stable formatting).
  saveProject(root, project);

  const missing = collectMissingAssets(root, project);
  if (missing.length) {
    const list = missing.map((m) => `${m.ref}  ${c.dim(`(${m.where})`)}`).join("\n  - ");
    const msg = `${missing.length} referenced asset(s) not found on disk:\n  - ${list}`;
    if (opts.strict) fail(msg);
    else log.warn(msg);
  }

  const briefs = countBriefs(project);
  if (briefs) {
    log.warn(`${briefs} slide(s) are still briefs (image pending) — run \`loom slides\` to generate them.`);
  }
  const unvoiced = project.scenes.filter((s) => s.script.trim() && !s.audio).length;
  if (unvoiced) {
    log.warn(`${unvoiced} scene(s) have narration but no audio — run \`loom voice\`.`);
  }
  if (project.style.captions) {
    const unaligned = project.scenes.filter((s) => s.audio && s.script.trim() && !s.captions.length).length;
    if (unaligned) {
      log.warn(`${unaligned} scene(s) have audio but no captions — run \`loom align\` for word-level captions.`);
    }
  }

  printSummary(project);
  log.ok(missing.length ? "composed with warnings" : "composed");
}

/** Count image/imageText slides that have a prompt but no generated image yet. */
function countBriefs(project: Project): number {
  let n = 0;
  for (const scene of project.scenes) {
    for (const slide of scene.slides) {
      if ((slide.layout === "image" || slide.layout === "imageText") && !slide.content.src) n++;
    }
  }
  return n;
}

type MissingAsset = { ref: string; where: string };

function collectMissingAssets(root: string, project: Project): MissingAsset[] {
  const missing: MissingAsset[] = [];
  const check = (ref: string | undefined, where: string) => {
    if (!ref) return;
    if (!existsSync(join(root, ref))) missing.push({ ref, where });
  };

  check(project.style.slideReference, "style.slideReference");
  check(project.music?.track, "music.track");
  for (const scene of project.scenes) {
    check(scene.audio?.path, `scene ${scene.id} audio`);
    for (const slide of scene.slides) {
      if (slide.layout === "image" || slide.layout === "imageText") {
        check(slide.content.src, `slide ${slide.id} image`);
      }
      if (slide.layout === "manim") check(slide.content.clip, `slide ${slide.id} clip`);
    }
  }
  return missing;
}

function printSummary(project: Project): void {
  const timeline = layoutTimeline(project);
  const totalMs = totalDurationMs(project);
  const [w, h] = project.meta.resolution;

  log.info("");
  log.info(`  ${c.bold(project.meta.title || project.id)}  ${c.dim(`${w}×${h} @ ${project.meta.fps}fps`)}`);
  log.info(
    `  ${project.scenes.length} scene(s) · ${fmt(totalMs)} · ${totalDurationFrames(project)} frames`,
  );
  for (const t of timeline) {
    const slides = t.scene.slides.map((s) => s.layout).join(", ") || c.dim("no slides");
    const audio = t.scene.audio ? "" : c.yellow(" · no audio");
    log.info(
      `    ${c.dim(fmt(t.startMs).padStart(7))}  ${t.scene.id}  ${c.dim(`(${fmt(t.durationMs)})`)}  ${slides}${audio}`,
    );
  }
  log.info("");
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}
