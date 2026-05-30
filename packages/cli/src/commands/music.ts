import { resolve } from "node:path";
import { attachMusic } from "@loom/pipeline";
import { log, c } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom music` — attach (or adjust, or clear) a background-music bed. Key-free and
 * local: bring your own royalty-free/licensed file.
 *
 *   loom music --import track.mp3            add a bed (transcoded to assets/music)
 *   loom music --import track.mp3 --volume 0.25 --duck 0.08
 *   loom music --volume 0.2                  retune the existing bed's levels
 *   loom music --clear                       remove the bed
 *
 * The renderer loops the track over the whole video and ducks it under narration,
 * so a short clip is fine. Levels are 0..1: --volume is the base level in
 * narration-free gaps, --duck the level while someone is speaking.
 */
export function music(opts: {
  project?: string;
  importFile?: string;
  volume?: number;
  duckTo?: number;
  clear?: boolean;
}): void {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);
  const src = opts.importFile ? resolve(opts.importFile) : undefined;

  if (src) log.step(`importing ${c.dim(src)} as the music bed…`);
  else if (opts.clear) log.step("removing the music bed…");
  else log.step("retuning the music bed…");

  const { project: updated, result } = attachMusic(project, root, {
    importFile: src,
    volume: opts.volume,
    duckTo: opts.duckTo,
    clear: opts.clear,
  });
  saveProject(root, updated);

  log.info("");
  if (result.action === "cleared") {
    log.ok("music bed removed");
    return;
  }

  const dur = result.durationMs ? `  ${c.dim(`${(result.durationMs / 1000).toFixed(2)}s`)}` : "";
  log.info(`  ${c.green("✓")} ${c.dim(result.track!)}${dur}`);
  log.info(`  ${c.dim(`volume ${result.volume} · ducks to ${result.duckTo} under narration`)}`);
  log.info("");
  log.ok(result.action === "set" ? "music bed set" : "music levels updated");
}
