import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "@loom/spec";
import { attachAudio, probeDurationMs, transcodeToMp3 } from "./audio";
import { PipelineError } from "./errors";

/**
 * The record/import path lets a user narrate in their own voice instead of (or
 * alongside) ElevenLabs TTS. Both modes converge on the same artifact `voice`
 * produces — a mono mp3 in assets/audio with a measured duration recorded on the
 * scene — so `align`, captions, and the renderer treat it identically.
 *
 * `ingestAudioFile` is the shared core: transcode a source file into the scene's
 * standard slot and attach it. The CLI's interactive mic capture records to a
 * temp wav, then hands that file here on "keep".
 */

export type IngestResult = { sceneId: string; durationMs: number; path: string };

/**
 * Transcode `srcFile` into `assets/audio/<sceneId>.mp3`, measure its duration,
 * and attach it to the scene (overwriting any existing audio for that scene).
 * Throws if the scene id is unknown or the source file is missing.
 */
export function ingestAudioFile(
  project: Project,
  root: string,
  sceneId: string,
  srcFile: string,
): { project: Project; result: IngestResult } {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    throw new PipelineError(`no scene with id "${sceneId}" in this project.`);
  }
  if (!existsSync(srcFile)) {
    throw new PipelineError(`audio file not found: ${srcFile}`);
  }

  const audioDir = join(root, "assets", "audio");
  mkdirSync(audioDir, { recursive: true });
  const rel = `assets/audio/${sceneId}.mp3`;
  transcodeToMp3(srcFile, join(root, rel));
  const durationMs = probeDurationMs(join(root, rel));

  const scenes = project.scenes.map((s) => (s.id === sceneId ? attachAudio(s, rel, durationMs) : s));
  return {
    project: { ...project, scenes },
    result: { sceneId, durationMs, path: rel },
  };
}

/**
 * The ffmpeg input format for live mic capture on this platform. Windows uses
 * DirectShow (dshow); macOS avfoundation; Linux PulseAudio. Returned alongside
 * `detectInputDevice` to build the capture command.
 */
export function captureInputFormat(): string {
  switch (process.platform) {
    case "win32":
      return "dshow";
    case "darwin":
      return "avfoundation";
    default:
      return "pulse";
  }
}

/**
 * Best-effort default microphone for this platform. On Windows we ask ffmpeg to
 * enumerate DirectShow devices and pick the first audio input. On macOS the
 * default avfoundation audio device is ":0"; on Linux PulseAudio's "default".
 * Callers can override with an explicit device name.
 */
export function detectInputDevice(): string {
  if (process.platform === "darwin") return ":0";
  if (process.platform !== "win32") return "default";

  // ffmpeg prints the device list to stderr and exits non-zero — that's expected.
  const res = spawnSync("ffmpeg", ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
    encoding: "utf8",
  });
  if (res.error) {
    throw new PipelineError(`could not run ffmpeg to list audio devices (${res.error.message}). Is it on PATH?`);
  }
  const device = firstDshowAudioDevice(res.stderr ?? "");
  if (!device) {
    throw new PipelineError(
      "no microphone found via ffmpeg dshow. List devices with " +
        '`ffmpeg -list_devices true -f dshow -i dummy` and pass one with --device "<name>".',
    );
  }
  return device;
}

/**
 * Parse the first audio input device out of ffmpeg's `-list_devices` stderr,
 * handling both output formats: modern ffmpeg (≥5.0) tags the name line
 * `"Name" (audio)`; older builds print a `DirectShow audio devices` section
 * header followed by quoted name lines (and `Alternative name` lines we skip).
 */
export function firstDshowAudioDevice(stderr: string): string | undefined {
  let inAudioSection = false;
  for (const line of stderr.split(/\r?\n/)) {
    const tagged = line.match(/"([^"]+)"\s*\(audio\)/);
    if (tagged) return tagged[1];

    // Check video first: the video header reads "DirectShow video devices (some
    // may be both video and audio devices)" — it mentions "audio devices" too.
    if (/video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }
    if (/audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }
    if (inAudioSection) {
      if (/alternative name/i.test(line)) continue; // the "@device_..." line
      const quoted = line.match(/"([^"]+)"/);
      if (quoted) return quoted[1];
    }
  }
  return undefined;
}

/**
 * ffmpeg args to record from `device` to `outFile` (mono, 44.1kHz). The recorder
 * is stopped by writing "q" to ffmpeg's stdin, which finalizes the file cleanly.
 */
export function captureArgs(device: string, outFile: string): string[] {
  const fmt = captureInputFormat();
  const input = fmt === "dshow" ? `audio=${device}` : device;
  return ["-hide_banner", "-loglevel", "error", "-y", "-f", fmt, "-i", input, "-ac", "1", "-ar", "44100", outFile];
}
