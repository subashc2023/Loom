import { loadEnv, writeScript } from "@loom/pipeline";
import { log, c } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";
import { printScenes } from "../summary";

/**
 * `loom script` — Opus polishes each scene's narration for spoken delivery and
 * attaches timing beats, without touching slide content. Idempotent-ish: re-run
 * after editing the plan to re-polish.
 */
export async function script(opts: { project?: string; model?: string }): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  loadEnv(root);
  const project = loadProject(root);

  log.step("polishing narration…");
  const updated = await writeScript(project, { model: opts.model });
  saveProject(root, updated);

  printScenes(updated);
  const beats = updated.scenes.reduce((n, s) => n + s.beats.length, 0);
  log.ok(`scripted ${c.bold(`${updated.scenes.length} scenes`)} ${c.dim(`(${beats} beats)`)} → ${c.dim("project.json")}`);
  log.step("next: loom voice   then   loom slides");
}
