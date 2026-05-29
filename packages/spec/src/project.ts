import { z } from "zod";
import { AssetPath, HexColor } from "./primitives";
import { Scene } from "./scene";

export const AspectRatio = z.enum(["16:9", "9:16", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatio>;

/** Pixel resolution as [width, height]. */
export const Resolution = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
]);
export type Resolution = z.infer<typeof Resolution>;

export const ProjectMeta = z.object({
  title: z.string().default(""),
  aspectRatio: AspectRatio.default("16:9"),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  resolution: Resolution.default([1920, 1080]),
});
export type ProjectMeta = z.infer<typeof ProjectMeta>;

export const Palette = z.object({
  bg: HexColor,
  fg: HexColor,
  accent: HexColor,
});
export type Palette = z.infer<typeof Palette>;

export const Fonts = z.object({
  display: z.string(),
  body: z.string(),
});
export type Fonts = z.infer<typeof Fonts>;

export const Style = z.object({
  palette: Palette.default({ bg: "#0a0a0a", fg: "#fafafa", accent: "#6366f1" }),
  fonts: Fonts.default({ display: "Inter", body: "Inter" }),
  // Reference image fed to every image-gen call to keep visual style consistent.
  slideReference: AssetPath.optional(),
  // Burn in word-level captions (when a scene has them, via `align`). On by
  // default — captions are the single biggest retention lever for explainers.
  captions: z.boolean().default(true),
  // Apply a gentle Ken Burns move to image slides that don't specify their own
  // motion. On by default — subtle motion stops static slides reading as dead
  // air. Set per-slide `motion: { type: "none" }` to opt one slide out, or
  // `kenBurns: false` to disable the auto-motion project-wide.
  kenBurns: z.boolean().default(true),
});
export type Style = z.infer<typeof Style>;

/** Background music with sidechain-style ducking under narration. */
export const Music = z.object({
  track: AssetPath,
  volume: z.number().min(0).max(1).default(0.3),
  // Level (0..1) to duck to while narration is playing.
  duckTo: z.number().min(0).max(1).default(0.1),
});
export type Music = z.infer<typeof Music>;

/**
 * The top-level spec. This JSON file is the durable artifact: every pipeline
 * stage reads and writes it, and the renderer is a pure function of it.
 */
export const Project = z.object({
  id: z.string().min(1),
  // Bumped when the schema changes in a breaking way; lets us migrate old specs.
  schemaVersion: z.literal(1).default(1),
  meta: ProjectMeta.default({}),
  style: Style.default({}),
  music: Music.optional(),
  scenes: z.array(Scene).default([]),
});
export type Project = z.infer<typeof Project>;
