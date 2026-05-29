import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaptionWord, Project, Scene } from "@loom/spec";
import { requireKey } from "./env";
import { PipelineError } from "./errors";

/**
 * `align` produces word-level caption timing for each voiced scene. It uses
 * ElevenLabs' forced-alignment endpoint: given the existing narration audio and
 * the known script, it returns the start/end time of every word. Because it
 * aligns the audio that already exists (rather than re-synthesizing), it never
 * touches `voice`'s output and stays independently re-rollable.
 *
 * Times come back in seconds relative to the audio, which starts at the scene's
 * own zero — so they map directly to the scene-relative ms the renderer expects.
 * Idempotent: scenes that already have captions are skipped unless `reroll`.
 */

const FORCED_ALIGNMENT_URL = "https://api.elevenlabs.io/v1/forced-alignment";

export type AlignResult = {
  sceneId: string;
  status: "aligned" | "skipped" | "no-audio" | "empty";
  words?: number;
};

export type AlignOptions = {
  /** Limit to one scene by id. */
  sceneId?: string;
  /** Re-align even scenes that already have captions. */
  reroll?: boolean;
};

export async function alignCaptions(
  project: Project,
  root: string,
  opts: AlignOptions = {},
): Promise<{ project: Project; results: AlignResult[] }> {
  const apiKey = requireKey(["ELEVENLABS_API_KEY"], "https://elevenlabs.io/app/settings/api-keys");

  const results: AlignResult[] = [];
  const scenes: Scene[] = [];

  for (const scene of project.scenes) {
    if (opts.sceneId && scene.id !== opts.sceneId) {
      scenes.push(scene);
      continue;
    }
    if (!scene.script.trim()) {
      results.push({ sceneId: scene.id, status: "empty" });
      scenes.push(scene);
      continue;
    }
    if (!scene.audio) {
      results.push({ sceneId: scene.id, status: "no-audio" });
      scenes.push(scene);
      continue;
    }
    if (scene.captions.length && !opts.reroll) {
      results.push({ sceneId: scene.id, status: "skipped" });
      scenes.push(scene);
      continue;
    }

    const words = await alignOne(
      apiKey,
      join(root, scene.audio.path),
      scene.script,
      scene.audio.durationMs,
    );
    scenes.push({ ...scene, captions: words });
    results.push({ sceneId: scene.id, status: "aligned", words: words.length });
  }

  if (opts.sceneId && !results.some((r) => r.sceneId === opts.sceneId)) {
    throw new PipelineError(`no scene with id "${opts.sceneId}" in this project.`);
  }

  return { project: { ...project, scenes }, results };
}

/** The subset of the forced-alignment response we rely on. */
type AlignmentResponse = {
  words?: Array<{ text?: string; start?: number; end?: number }>;
};

async function alignOne(
  apiKey: string,
  audioFile: string,
  text: string,
  audioDurationMs: number,
): Promise<CaptionWord[]> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(audioFile);
  } catch (e) {
    throw new PipelineError(
      `could not read narration audio at ${audioFile}: ${(e as Error).message}. Run \`loom voice\` first.`,
    );
  }

  const form = new FormData();
  // Copy into a plain Uint8Array — Node's Buffer isn't a valid BlobPart under TS.
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("text", text);

  let res: Response;
  try {
    // Let fetch set the multipart boundary; only the API key header is ours.
    res = await fetch(FORCED_ALIGNMENT_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
  } catch (e) {
    throw new PipelineError(`could not reach ElevenLabs: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new PipelineError(
      `ElevenLabs forced-alignment error ${res.status}: ${(await res.text()).slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as AlignmentResponse;
  if (!Array.isArray(data.words) || data.words.length === 0) {
    throw new PipelineError("ElevenLabs returned no word alignment.");
  }

  const words: CaptionWord[] = [];
  for (const w of data.words) {
    const word = (w.text ?? "").trim();
    if (!word) continue; // skip whitespace / punctuation-only tokens
    const startMs = clamp(Math.round((w.start ?? 0) * 1000), 0, audioDurationMs);
    const endMs = clamp(Math.round((w.end ?? 0) * 1000), startMs, audioDurationMs);
    words.push({ text: word, startMs, endMs });
  }
  if (!words.length) {
    throw new PipelineError("ElevenLabs alignment contained no usable words.");
  }
  return words;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
