import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "@loom/spec";
import { probeDurationMs } from "./audio";
import { PipelineError } from "./errors";

/**
 * `music` attaches a background-music bed to the project. The spec already carries
 * a `music` field and the renderer already loops + sidechain-ducks it under
 * narration (see `musicVolumeAt`); this stage is the one piece that was missing —
 * the way to actually point the project at a track and set its levels.
 *
 * It's a key-free, local stage: bring your own file (royalty-free / licensed) and
 * `--import` it. The file is transcoded to a normalized STEREO mp3 (narration is
 * mono; music shouldn't be) into assets/music, then recorded on the project. The
 * renderer loops it to cover the whole video, so a short track is fine. You can
 * also adjust `--volume`/`--duck` on an existing bed, or `--clear` it.
 */

/** Canonical slot for the (single) music bed, mirroring the per-scene audio slots. */
export const MUSIC_REL = "assets/music/bed.mp3";

export type MusicResult = {
  action: "set" | "updated" | "cleared";
  track?: string;
  durationMs?: number;
  volume?: number;
  duckTo?: number;
};

export type MusicOptions = {
  /** Absolute path to an audio file to import as the bed. */
  importFile?: string;
  /** Base music level 0..1 (volume in narration-free gaps). */
  volume?: number;
  /** Ducked level 0..1 while narration plays. */
  duckTo?: number;
  /** Remove the music bed from the project. */
  clear?: boolean;
};

export function attachMusic(
  project: Project,
  root: string,
  opts: MusicOptions,
): { project: Project; result: MusicResult } {
  if (opts.clear) {
    if (!project.music) throw new PipelineError("this project has no music bed to clear.");
    return { project: { ...project, music: undefined }, result: { action: "cleared" } };
  }

  // No file given: adjust the levels of the existing bed (nothing to import).
  if (!opts.importFile) {
    if (!project.music) {
      throw new PipelineError("no music bed yet — add one with `loom music --import <file>`.");
    }
    if (opts.volume === undefined && opts.duckTo === undefined) {
      throw new PipelineError("nothing to do — pass --import <file>, --volume/--duck, or --clear.");
    }
    const volume = opts.volume ?? project.music.volume;
    const duckTo = opts.duckTo ?? project.music.duckTo;
    return {
      project: { ...project, music: { ...project.music, volume, duckTo } },
      result: { action: "updated", track: project.music.track, volume, duckTo },
    };
  }

  // Import: transcode the source file into the canonical stereo-mp3 slot.
  if (!existsSync(opts.importFile)) {
    throw new PipelineError(`music file not found: ${opts.importFile}`);
  }
  mkdirSync(join(root, "assets", "music"), { recursive: true });
  const dest = join(root, MUSIC_REL);
  transcodeMusicToMp3(opts.importFile, dest);
  const durationMs = probeDurationMs(dest);

  // Keep any prior levels unless overridden; fall back to the schema defaults.
  const volume = opts.volume ?? project.music?.volume ?? 0.3;
  const duckTo = opts.duckTo ?? project.music?.duckTo ?? 0.1;
  return {
    project: { ...project, music: { track: MUSIC_REL, volume, duckTo } },
    result: { action: "set", track: MUSIC_REL, durationMs, volume, duckTo },
  };
}

/**
 * Transcode an arbitrary audio file into a normalized stereo mp3 at `dest`, via
 * ffmpeg. Like `transcodeToMp3` for narration but keeps two channels (music) and
 * uses a higher bitrate. Overwrites `dest`.
 */
function transcodeMusicToMp3(src: string, dest: string): void {
  const res = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", src, "-ac", "2", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "192k", dest],
    { encoding: "utf8" },
  );
  if (res.error) {
    throw new PipelineError(`ffmpeg failed (${res.error.message}). Is ffmpeg installed and on PATH?`);
  }
  if (res.status !== 0) {
    throw new PipelineError(`ffmpeg could not transcode ${src}: ${res.stderr.trim()}`);
  }
}
