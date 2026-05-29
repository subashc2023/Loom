import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  applyVariation,
  generateSlides,
  generateVariations,
  loadEnv,
  setStyleReference,
  type Variation,
} from "@loom/pipeline";
import { log, c, fail } from "../log";
import { ask, openInViewer } from "../prompt";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom slides` — generate images for slide briefs with Gemini into assets/images
 * and fill in each slide's `src`. Skips slides that already have an image unless
 * --reroll. Narrow with --scene <id> and/or --slide <id>.
 *
 * With --variations <n> --slide <id> it instead generates N candidate images for
 * one slide, opens them, and lets you pick the keeper (re-roll UX).
 */
export async function slides(opts: {
  project?: string;
  scene?: string;
  slide?: string;
  reroll?: boolean;
  model?: string;
  variations?: number;
  setReference?: string;
}): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  loadEnv(root);
  const project = loadProject(root);

  if (opts.setReference !== undefined) {
    const { project: updated, result } = setStyleReference(project, root, opts.setReference);
    saveProject(root, updated);
    log.ok(`style lock set → ${c.bold(result.reference)} ${c.dim(`(from ${result.source})`)}`);
    log.info(c.dim("  run `loom slides --reroll` to regenerate slides against this reference."));
    return;
  }

  if (opts.variations !== undefined) {
    await pickVariation(root, project, opts);
    return;
  }

  log.step("generating images with Gemini…");
  const { project: updated, results } = await generateSlides(project, root, {
    sceneId: opts.scene,
    slideId: opts.slide,
    reroll: opts.reroll,
    model: opts.model,
  });
  saveProject(root, updated);

  log.info("");
  for (const r of results) {
    if (r.status === "generated") {
      log.info(`  ${c.green("✓")} ${r.slideId.padEnd(6)} ${c.dim(r.path!)}`);
    } else if (r.status === "skipped") {
      log.info(`  ${c.dim("·")} ${r.slideId.padEnd(6)} ${c.dim("already has an image (use --reroll)")}`);
    } else {
      log.info(`  ${c.dim("·")} ${r.slideId.padEnd(6)} ${c.dim("no prompt — nothing to generate")}`);
    }
  }
  log.info("");

  const made = results.filter((r) => r.status === "generated").length;
  log.ok(`generated ${c.bold(`${made} image(s)`)}`);
}

/**
 * Generate N candidate images for one slide, open them for comparison, and loop
 * on a pick/regenerate/cancel prompt until the user chooses one or bails. The
 * chosen variant becomes the slide's image; the rest are cleaned up.
 */
async function pickVariation(
  root: string,
  project: ReturnType<typeof loadProject>,
  opts: { slide?: string; model?: string; variations?: number },
): Promise<void> {
  const count = opts.variations!;
  if (!opts.slide) fail("--variations needs --slide <id> (variations target a single slide)");
  if (!Number.isInteger(count) || count < 2 || count > 6) fail(`--variations must be between 2 and 6, got ${count}`);

  let current = project;
  for (;;) {
    log.step(`generating ${c.bold(`${count} variations`)} for slide ${c.bold(opts.slide!)} with Gemini…`);
    const { variants, prompt } = await generateVariations(current, root, {
      slideId: opts.slide!,
      count,
      model: opts.model,
    });

    log.info("");
    log.info(`  ${c.dim("prompt:")} ${prompt}`);
    for (const v of variants) {
      log.info(`  ${c.cyan(String(v.index))}  ${c.dim(v.path)}`);
      openInViewer(join(root, v.path));
    }
    log.info("");

    const ans = (await ask(`${c.cyan("?")} Pick a variation [1-${count}], ${c.bold("r")} to regenerate, ${c.bold("q")} to cancel: `))
      .trim()
      .toLowerCase();

    if (ans === "q") {
      cleanup(root, variants);
      log.info("cancelled — slide image unchanged.");
      return;
    }
    if (ans === "r") {
      cleanup(root, variants);
      log.step("regenerating…");
      log.info("");
      continue;
    }

    const choice = Number.parseInt(ans, 10);
    const picked = variants.find((v) => v.index === choice);
    if (!picked) {
      log.warn(`"${ans}" isn't 1-${count}, r, or q — try again.`);
      cleanup(root, variants);
      continue;
    }

    const { project: updated, result } = applyVariation(current, root, opts.slide!, picked.path);
    saveProject(root, updated);
    cleanup(root, variants); // remove all temp variants; the keeper now lives at the canonical path
    current = updated;
    log.info("");
    log.ok(`kept variation ${c.bold(String(choice))} → ${c.dim(result.path!)}`);
    return;
  }
}

/** Remove the temporary variation files. */
function cleanup(root: string, variants: Variation[]): void {
  for (const v of variants) {
    const abs = join(root, v.path);
    if (existsSync(abs)) rmSync(abs, { force: true });
  }
}
