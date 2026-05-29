import { resolve } from "node:path";
import { ingestAudioFile, loadEnv, synthesizeVoice } from "@loom/pipeline";
import { log, c, fail } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom voice` — synthesize narration with ElevenLabs into assets/audio, measure
 * durations, and record them on each scene. Skips already-voiced scenes unless
 * --reroll. Narrow with --scene <id>.
 *
 * With --import <file>, skip TTS entirely and bring in an audio file you recorded
 * elsewhere as one scene's narration (requires --scene). It's transcoded into the
 * same mono-mp3 slot synthesis would use, so `align` and render treat it the same.
 */
export async function voice(opts: {
  project?: string;
  scene?: string;
  reroll?: boolean;
  voiceId?: string;
  model?: string;
  importFile?: string;
}): Promise<void> {
  const root = resolveProjectRoot(opts.project);

  if (opts.importFile) {
    await importVoice(root, opts.scene, opts.importFile);
    return;
  }

  loadEnv(root);
  const project = loadProject(root);

  log.step("synthesizing voice with ElevenLabs…");
  const { project: updated, results } = await synthesizeVoice(project, root, {
    sceneId: opts.scene,
    reroll: opts.reroll,
    voiceId: opts.voiceId,
    model: opts.model,
  });
  saveProject(root, updated);

  log.info("");
  for (const r of results) {
    if (r.status === "generated") {
      log.info(`  ${c.green("✓")} ${r.sceneId.padEnd(4)} ${c.dim(`${(r.durationMs! / 1000).toFixed(2)}s`)}  ${c.dim(r.path!)}`);
    } else if (r.status === "skipped") {
      log.info(`  ${c.dim("·")} ${r.sceneId.padEnd(4)} ${c.dim("already voiced (use --reroll)")}`);
    } else {
      log.info(`  ${c.yellow("!")} ${r.sceneId.padEnd(4)} ${c.yellow("empty script — skipped")}`);
    }
  }
  log.info("");

  const made = results.filter((r) => r.status === "generated").length;
  log.ok(`voiced ${c.bold(`${made} scene(s)`)}`);
}

/** Bring an externally-recorded file in as one scene's narration. */
async function importVoice(root: string, scene: string | undefined, file: string): Promise<void> {
  if (!scene) fail("--import needs --scene <id> (one file maps to one scene)");
  const src = resolve(file);
  const project = loadProject(root);

  log.step(`importing ${c.dim(src)} → scene ${scene}…`);
  const { project: updated, result } = ingestAudioFile(project, root, scene, src);
  saveProject(root, updated);

  log.info("");
  log.info(`  ${c.green("✓")} ${result.sceneId.padEnd(4)} ${c.dim(`${(result.durationMs / 1000).toFixed(2)}s`)}  ${c.dim(result.path)}`);
  log.info("");
  log.ok(`imported narration for ${c.bold(scene)}`);
}
