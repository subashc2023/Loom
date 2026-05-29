import { applyCuts } from "@loom/pipeline";
import { log, c } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom cut` — distribute each scene's slides across its duration, cutting to the
 * next slide on emphasis/punchline/slide-change beats (the "cuts on emphasis"
 * pass). Rewrites only slide timing; content is untouched. Narrow with --scene.
 */
export function cut(opts: { project?: string; scene?: string }): void {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);

  const { project: updated, results } = applyCuts(project, { sceneId: opts.scene });
  saveProject(root, updated);

  log.info("");
  for (const r of results) {
    if (r.status === "skipped") {
      log.info(`  ${c.dim("·")} ${r.sceneId.padEnd(4)} ${c.dim(`${r.slides} slide(s) — nothing to cut`)}`);
    } else {
      const on = r.cuts > 0 ? `on ${r.cuts} beat(s)` : "evenly (no beats)";
      log.info(`  ${c.green("✓")} ${r.sceneId.padEnd(4)} ${c.dim(`${r.slides} slides ${on}`)}`);
    }
  }
  log.info("");

  const made = results.filter((r) => r.status === "cut").length;
  log.ok(`re-timed ${c.bold(`${made} scene(s)`)}`);
}
