import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PipelineError, captureArgs, detectInputDevice, ingestAudioFile, probeDurationMs } from "@loom/pipeline";
import { log, c, fail } from "../log";
import { ask } from "../prompt";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom record` — narrate a scene in your own voice instead of ElevenLabs TTS.
 * Captures from the default microphone via ffmpeg, plays the take back, and asks
 * keep/redo, looping until you're happy. A kept take is transcoded into the same
 * mono-mp3 slot `voice` would produce, so `align` and render treat it identically.
 *
 * Pick the scene with --scene <id>; override the mic with --device "<name>".
 */
export async function record(opts: { project?: string; scene?: string; device?: string }): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  const project = loadProject(root);

  const sceneId = opts.scene;
  if (!sceneId) fail("loom record needs --scene <id> (which scene to narrate)");
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) fail(`no scene with id "${sceneId}" in this project.`);

  log.info("");
  if (scene.script.trim()) {
    log.info(`  ${c.dim("read:")} ${scene.script.trim()}`);
  } else {
    log.warn("this scene has no script — recording anyway.");
  }
  if (scene.audio) log.warn(`scene ${sceneId} already has audio — a kept take replaces it.`);

  const device = opts.device || detectInputDevice();
  log.info(`  ${c.dim("mic:")}  ${device}`);
  log.info("");

  const audioDir = join(root, "assets", "audio");
  mkdirSync(audioDir, { recursive: true });
  const takeFile = join(audioDir, `.${sceneId}.take.wav`);

  try {
    for (;;) {
      await captureToFile(device, takeFile);
      const dur = safeDurationMs(takeFile);
      log.ok(`captured ${dur ? c.bold(`${(dur / 1000).toFixed(2)}s`) : "take"}`);
      playback(takeFile);

      const ans = (await ask(`${c.cyan("?")} Keep this take? [y/N/q] `)).trim().toLowerCase();
      if (ans === "q") {
        log.info("aborted — scene audio unchanged.");
        break;
      }
      if (ans === "y" || ans === "yes") {
        const { project: updated, result } = ingestAudioFile(project, root, sceneId, takeFile);
        saveProject(root, updated);
        log.info("");
        log.ok(`saved narration for ${c.bold(sceneId)} ${c.dim(`(${(result.durationMs / 1000).toFixed(2)}s → ${result.path})`)}`);
        log.step(`next: ${c.bold(`loom align --scene ${sceneId}`)} for word-level captions, then ${c.bold("loom render")}.`);
        break;
      }
      log.step("redoing — take again.");
      log.info("");
    }
  } finally {
    if (existsSync(takeFile)) rmSync(takeFile, { force: true });
  }
}

/**
 * Record from `device` to `outFile`, returning when the user presses Enter (which
 * sends "q" to ffmpeg so it finalizes the file cleanly). Rejects if ffmpeg can't
 * start or dies before the user stops it (e.g. a bad device name).
 */
function captureToFile(device: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", captureArgs(device, outFile), { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    let userStopped = false;
    let settled = false;

    const onData = () => {
      if (settled || userStopped) return;
      userStopped = true;
      log.step("stopping…");
      child.stdin?.write("q");
      child.stdin?.end();
      // If 'q' doesn't take, terminate so we don't hang.
      setTimeout(() => {
        try {
          child.kill("SIGINT");
        } catch {
          /* already gone */
        }
      }, 2500);
    };

    const done = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
    };

    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      done();
      reject(new PipelineError(`could not start ffmpeg: ${e.message}. Is it on PATH?`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      done();
      if (!userStopped && code !== 0) {
        reject(
          new PipelineError(
            `recording failed (ffmpeg exit ${code}). Try a different --device.\n${stderr.trim().slice(-500)}`,
          ),
        );
      } else {
        resolve();
      }
    });

    log.step(`${c.bold("Recording…")} press ${c.bold("Enter")} to stop.`);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

/** Play a take back so the user can judge it. No-op (with a note) if ffplay is absent. */
function playback(file: string): void {
  log.step("playing back…");
  const res = spawnSync("ffplay", ["-autoexit", "-nodisp", "-loglevel", "error", file], { stdio: "inherit" });
  if (res.error) {
    log.warn("ffplay not found — skipping playback (it ships with ffmpeg).");
  }
}

function safeDurationMs(file: string): number | null {
  try {
    return probeDurationMs(file);
  } catch {
    return null;
  }
}
