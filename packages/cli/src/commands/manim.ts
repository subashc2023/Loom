import { renderManim } from "@loom/pipeline";
import { log, c } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom manim` — render the Manim scene behind each `manim` slide into a clip and
 * fill in its `clip` (plus the slide's measured `durationMs`). Needs the `manim`
 * binary on PATH, but no API key. Skips slides that already have a clip unless
 * --reroll. Narrow with --scene <id> and/or --slide <id>.
 */
export function manim(opts: { project?: string; scene?: string; slide?: string; reroll?: boolean }): void {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);

  log.step("rendering Manim scenes…");
  const { project: updated, results } = renderManim(project, root, {
    sceneId: opts.scene,
    slideId: opts.slide,
    reroll: opts.reroll,
  });
  saveProject(root, updated);

  log.info("");
  for (const r of results) {
    if (r.status === "rendered") {
      const dur = r.durationMs ? c.dim(`(${(r.durationMs / 1000).toFixed(2)}s)`) : "";
      log.info(`  ${c.green("✓")} ${r.slideId.padEnd(8)} ${c.dim(r.path!)} ${dur}`);
    } else if (r.status === "skipped") {
      log.info(`  ${c.dim("·")} ${r.slideId.padEnd(8)} ${c.dim("already has a clip (use --reroll)")}`);
    } else {
      log.info(`  ${c.dim("·")} ${r.slideId.padEnd(8)} ${c.dim("no sceneSource — nothing to render")}`);
    }
  }
  log.info("");

  const made = results.filter((r) => r.status === "rendered").length;
  log.ok(`rendered ${c.bold(`${made} clip(s)`)}`);
}
