import { alignCaptions, loadEnv } from "@loom/pipeline";
import { log, c } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom align` — derive word-level caption timing for each voiced scene using
 * ElevenLabs forced alignment, and record it on the scene for the renderer to
 * burn in. Skips already-aligned scenes unless --reroll. Narrow with --scene.
 */
export async function align(opts: {
  project?: string;
  scene?: string;
  reroll?: boolean;
}): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  loadEnv(root);
  const project = loadProject(root);

  log.step("aligning captions with ElevenLabs…");
  const { project: updated, results } = await alignCaptions(project, root, {
    sceneId: opts.scene,
    reroll: opts.reroll,
  });
  saveProject(root, updated);

  log.info("");
  for (const r of results) {
    if (r.status === "aligned") {
      log.info(`  ${c.green("✓")} ${r.sceneId.padEnd(4)} ${c.dim(`${r.words} word(s)`)}`);
    } else if (r.status === "skipped") {
      log.info(`  ${c.dim("·")} ${r.sceneId.padEnd(4)} ${c.dim("already aligned (use --reroll)")}`);
    } else if (r.status === "no-audio") {
      log.info(`  ${c.yellow("!")} ${r.sceneId.padEnd(4)} ${c.yellow("no audio — run loom voice first")}`);
    } else {
      log.info(`  ${c.dim("·")} ${r.sceneId.padEnd(4)} ${c.dim("empty script — nothing to align")}`);
    }
  }
  log.info("");

  const made = results.filter((r) => r.status === "aligned").length;
  log.ok(`aligned ${c.bold(`${made} scene(s)`)}`);
}
