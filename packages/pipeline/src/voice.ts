import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, Scene } from "@loom/spec";
import { attachAudio, probeDurationMs } from "./audio";
import { requireKey } from "./env";
import { PipelineError } from "./errors";

/**
 * `voice` synthesizes each scene's narration with ElevenLabs, writes an mp3 into
 * the project's assets/audio tree, measures its true duration with ffprobe, and
 * records it on the scene. It also stretches a scene's single slide to cover the
 * narration so nothing cuts to background mid-sentence. Idempotent: scenes that
 * already have audio are skipped unless `reroll` is set.
 */

const API_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // ElevenLabs "Sarah" — a current premade voice usable on the free tier (the old "Rachel" default became a paid-only library voice)
const DEFAULT_MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

export type VoiceResult = {
  sceneId: string;
  status: "generated" | "skipped" | "empty";
  durationMs?: number;
  path?: string;
};

export type VoiceOptions = {
  /** Limit to one scene by id. */
  sceneId?: string;
  /** Re-synthesize even scenes that already have audio. */
  reroll?: boolean;
  voiceId?: string;
  model?: string;
};

export async function synthesizeVoice(
  project: Project,
  root: string,
  opts: VoiceOptions = {},
): Promise<{ project: Project; results: VoiceResult[] }> {
  const apiKey = requireKey(["ELEVENLABS_API_KEY"], "https://elevenlabs.io/app/settings/api-keys");
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  const audioDir = join(root, "assets", "audio");
  mkdirSync(audioDir, { recursive: true });

  const results: VoiceResult[] = [];
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
    if (scene.audio && !opts.reroll) {
      results.push({ sceneId: scene.id, status: "skipped" });
      scenes.push(scene);
      continue;
    }

    const bytes = await synthesizeOne(apiKey, voiceId, scene.script, opts.model);
    const rel = `assets/audio/${scene.id}.mp3`;
    writeFileSync(join(root, rel), bytes);
    const durationMs = probeDurationMs(join(root, rel));

    scenes.push(attachAudio(scene, rel, durationMs));
    results.push({ sceneId: scene.id, status: "generated", durationMs, path: rel });
  }

  if (opts.sceneId && !results.some((r) => r.sceneId === opts.sceneId)) {
    throw new PipelineError(`no scene with id "${opts.sceneId}" in this project.`);
  }

  return { project: { ...project, scenes }, results };
}

async function synthesizeOne(
  apiKey: string,
  voiceId: string,
  text: string,
  model?: string,
): Promise<Buffer> {
  const url = `${API_BASE}/${voiceId}?output_format=${OUTPUT_FORMAT}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model || DEFAULT_MODEL }),
    });
  } catch (e) {
    throw new PipelineError(`could not reach ElevenLabs: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    // Free ElevenLabs accounts can't use "library" voices via the API; point the
    // user at picking a usable premade voice instead of just echoing the 402.
    if (res.status === 402 && body.includes("paid_plan_required")) {
      throw new PipelineError(
        `ElevenLabs rejected voice "${voiceId}" — it's a paid-only voice for your account.\n` +
          `  Pick a premade voice your plan allows: \`loom voice --voice-id <id>\` ` +
          `(or set ELEVENLABS_VOICE_ID). List yours at https://elevenlabs.io/app/voice-library.`,
      );
    }
    throw new PipelineError(`ElevenLabs API error ${res.status}: ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
