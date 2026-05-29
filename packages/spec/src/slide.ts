import { z } from "zod";
import { AssetPath, Ms, Rect } from "./primitives";

/**
 * Ken Burns motion: the visible region animates from `from` to `to` over the
 * slide's duration. `none` is an explicit static slide (the default when motion
 * is omitted).
 */
export const Motion = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("kenBurns"),
    from: Rect,
    to: Rect,
  }),
  z.object({
    type: z.literal("none"),
  }),
]);
export type Motion = z.infer<typeof Motion>;

/**
 * A small palette of gentle default Ken Burns moves, used when a slide doesn't
 * specify its own motion and auto-motion is enabled. Kept subtle (≤ ~1.18×
 * zoom) so it reads as life, not a slideshow effect. Picked deterministically
 * per slide so neighbours differ but a given slide always animates the same way.
 */
const KEN_BURNS_PRESETS: ReadonlyArray<Extract<Motion, { type: "kenBurns" }>> = [
  // slow zoom in, centred
  { type: "kenBurns", from: { x: 0, y: 0, width: 1, height: 1 }, to: { x: 0.075, y: 0.075, width: 0.85, height: 0.85 } },
  // slow zoom out, centred
  { type: "kenBurns", from: { x: 0.075, y: 0.075, width: 0.85, height: 0.85 }, to: { x: 0, y: 0, width: 1, height: 1 } },
  // gentle pan right with a slight zoom
  { type: "kenBurns", from: { x: 0, y: 0.05, width: 0.9, height: 0.9 }, to: { x: 0.1, y: 0.05, width: 0.9, height: 0.9 } },
  // gentle pan left with a slight zoom
  { type: "kenBurns", from: { x: 0.1, y: 0.05, width: 0.9, height: 0.9 }, to: { x: 0, y: 0.05, width: 0.9, height: 0.9 } },
];

/** Stable non-negative hash of a string, for deterministic preset selection. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h < 0 ? -h : h;
}

/** The default Ken Burns move for a slide, chosen deterministically by `seed`. */
export function defaultKenBurns(seed: string): Extract<Motion, { type: "kenBurns" }> {
  return KEN_BURNS_PRESETS[hashString(seed) % KEN_BURNS_PRESETS.length]!;
}

/**
 * Resolve the motion the renderer should actually apply to a slide. An explicit
 * `motion` always wins — both a hand-authored `kenBurns` and an explicit `none`
 * (the opt-out) are honoured. When motion is omitted, auto-motion fills in a
 * gentle default if enabled, otherwise the slide stays static.
 */
export function resolveMotion(
  motion: Motion | undefined,
  kenBurnsEnabled: boolean,
  seed: string,
): Motion {
  if (motion) return motion;
  if (!kenBurnsEnabled) return { type: "none" };
  return defaultKenBurns(seed);
}

/** Where text sits relative to the image in an imageText layout. */
export const TextPosition = z.enum(["left", "right", "top", "bottom"]);
export type TextPosition = z.infer<typeof TextPosition>;

/**
 * Attribution for an image sourced from a public repository (Wikimedia Commons,
 * etc.) rather than generated. Stored on the slide so the credit travels with the
 * spec — the renderer shows a small on-image credit and licences like CC-BY are
 * honoured. AI-generated images have no credit.
 */
export const ImageCredit = z.object({
  /** Where it came from, e.g. "Wikimedia Commons". */
  source: z.string().min(1),
  /** The work's title / file title. */
  title: z.string().min(1),
  /** The author/uploader, plain text (HTML stripped). */
  author: z.string().optional(),
  /** Human-readable licence, e.g. "CC BY 4.0", "Public domain", "CC0". */
  license: z.string().optional(),
  /** Link to the source/description page. */
  url: z.string().optional(),
});
export type ImageCredit = z.infer<typeof ImageCredit>;

/**
 * Fields shared by every slide regardless of layout. `startMs`/`durationMs` are
 * relative to the start of the owning scene.
 */
const SlideBase = {
  id: z.string().min(1),
  startMs: Ms,
  durationMs: Ms.refine((d) => d > 0, { message: "slide duration must be > 0" }),
  motion: Motion.optional(),
};

/**
 * Slide is a discriminated union on `layout` so each layout carries its own
 * type-checked content. This is the single most important type in the spec:
 * Claude Code mutates slides constantly, and a typed union means an invalid edit
 * fails Zod validation instead of silently rendering garbage.
 *
 * Renderer implements: image, imageText, title, chart, bullets, quote, code, manim.
 */
export const Slide = z.discriminatedUnion("layout", [
  // --- MVP layouts ---
  z.object({
    ...SlideBase,
    layout: z.literal("image"),
    content: z.object({
      // `src` is optional so `plan` can emit a brief (just `prompt`) before the
      // `slides` stage generates the image and fills `src` in.
      src: AssetPath.optional(),
      // The image-generation brief, written by `plan`, consumed by `slides`.
      prompt: z.string().optional(),
      // Keyword query for sourcing a real image from a public repo (Commons),
      // written by `plan`, consumed by `source`. Distinct from the AI `prompt`.
      query: z.string().optional(),
      // Attribution, set by `source` when `src` is a real sourced image.
      credit: ImageCredit.optional(),
      alt: z.string().optional(),
      fit: z.enum(["cover", "contain"]).default("cover"),
    }),
  }),
  z.object({
    ...SlideBase,
    layout: z.literal("imageText"),
    content: z.object({
      src: AssetPath.optional(),
      prompt: z.string().optional(),
      query: z.string().optional(),
      credit: ImageCredit.optional(),
      heading: z.string().optional(),
      body: z.string(),
      position: TextPosition.default("bottom"),
      fit: z.enum(["cover", "contain"]).default("cover"),
    }),
  }),
  z.object({
    ...SlideBase,
    layout: z.literal("title"),
    content: z.object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
    }),
  }),

  z.object({
    ...SlideBase,
    layout: z.literal("chart"),
    content: z.object({
      chartType: z.enum(["bar", "line", "area", "pie"]),
      data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
      xKey: z.string(),
      yKeys: z.array(z.string()).min(1),
      title: z.string().optional(),
    }),
  }),

  z.object({
    ...SlideBase,
    layout: z.literal("bullets"),
    content: z.object({
      title: z.string().optional(),
      items: z.array(z.string()).min(1),
    }),
  }),
  z.object({
    ...SlideBase,
    layout: z.literal("quote"),
    content: z.object({
      text: z.string().min(1),
      attribution: z.string().optional(),
    }),
  }),

  z.object({
    ...SlideBase,
    layout: z.literal("code"),
    content: z.object({
      code: z.string().min(1),
      // Highlighting hint, e.g. "ts", "py", "json"; "diff" tints +/- rows.
      language: z.string().optional(),
      // Optional caption shown in the editor title bar (e.g. a filename).
      title: z.string().optional(),
      // 1-based line numbers to emphasize; the rest dim to focus the eye.
      highlight: z.array(z.number().int().min(1)).optional(),
    }),
  }),

  z.object({
    ...SlideBase,
    layout: z.literal("manim"),
    content: z.object({
      // Path to the rendered Manim clip once produced. The `manim` stage fills
      // this in by running `sceneName` from `sceneSource`; until then the slide
      // renders as a "Manim pending" placeholder.
      clip: AssetPath.optional(),
      // Inline Manim scene source the `manim` stage writes out and renders.
      sceneSource: z.string().optional(),
      // The Scene subclass within the source to render.
      sceneName: z.string().min(1),
    }),
  }),
]);
export type Slide = z.infer<typeof Slide>;

/** The set of layouts the renderer currently knows how to draw. */
export const IMPLEMENTED_LAYOUTS = ["image", "imageText", "title", "chart", "bullets", "quote", "code", "manim"] as const;
export type ImplementedLayout = (typeof IMPLEMENTED_LAYOUTS)[number];
