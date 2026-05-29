import { z } from "zod";
import { AssetPath, Ms } from "./primitives";
import { Slide } from "./slide";

/**
 * A timing marker emitted by the script stage and consumed downstream to align
 * slide changes, emphasis effects, and captions. `tMs` is relative to the scene.
 */
export const KNOWN_BEAT_TAGS = [
  "slide-change",
  "emphasis",
  "punchline",
  "pause",
] as const;

export const Beat = z.object({
  tMs: Ms,
  // Free-form to allow custom tags, but the known set documents intent.
  tag: z.string().min(1),
});
export type Beat = z.infer<typeof Beat>;

/** How one scene gives way to the next. */
export const Transition = z.object({
  type: z.enum(["cut", "fade", "slide"]),
  durationMs: Ms,
});
export type Transition = z.infer<typeof Transition>;

/** Narration audio for a scene, with its measured duration. */
export const SceneAudio = z.object({
  path: AssetPath,
  durationMs: Ms.refine((d) => d > 0, { message: "audio duration must be > 0" }),
});
export type SceneAudio = z.infer<typeof SceneAudio>;

/**
 * One spoken word with its scene-relative timing, produced by the `align` stage
 * (forced alignment of the narration audio against the script). The renderer uses
 * these to burn in word-level captions with a current-word highlight. `startMs`
 * and `endMs` are relative to the scene start, same frame of reference as a
 * slide's `startMs` and the scene's audio.
 */
export const CaptionWord = z.object({
  text: z.string().min(1),
  startMs: Ms,
  endMs: Ms,
});
export type CaptionWord = z.infer<typeof CaptionWord>;

/**
 * A coherent narrative unit — usually one paragraph of narration. Owns its audio
 * segment, its slides, and the timing that binds them. Renders as one Remotion
 * <Sequence>.
 *
 * `audio` is optional so a scene can exist in the spec before the voice stage has
 * run (plan/script produce scenes; voice fills in audio).
 */
export const Scene = z.object({
  id: z.string().min(1),
  script: z.string(),
  audio: SceneAudio.optional(),
  beats: z.array(Beat).default([]),
  // Word-level caption timing, filled by the `align` stage. Empty until then.
  captions: z.array(CaptionWord).default([]),
  slides: z.array(Slide).default([]),
  transition: Transition.default({ type: "fade", durationMs: 200 }),
});
export type Scene = z.infer<typeof Scene>;
