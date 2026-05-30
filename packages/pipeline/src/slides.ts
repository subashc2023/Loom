import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { Project, Scene, Slide } from "@loom/spec";
import { requireKey } from "./env";
import { PipelineError } from "./errors";
import { fetchResilient, readJson } from "./http";

/**
 * `slides` generates the actual images for slide *briefs* (image/imageText slides
 * that have a `prompt` but no `src`) using Gemini's image model ("Nano Banana"),
 * writes them into assets/images, and fills in `src`. If the project sets a style
 * reference image it is passed into every call as a style lock for visual
 * consistency. Idempotent: slides that already have an image are skipped unless
 * `reroll` is set.
 */

const MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type ImageSlide = Extract<Slide, { layout: "image" | "imageText" }>;

export type SlideResult = {
  slideId: string;
  sceneId: string;
  status: "generated" | "skipped" | "no-prompt";
  path?: string;
};

export type SlidesOptions = {
  sceneId?: string;
  slideId?: string;
  reroll?: boolean;
  model?: string;
};

export async function generateSlides(
  project: Project,
  root: string,
  opts: SlidesOptions = {},
): Promise<{ project: Project; results: SlideResult[] }> {
  const apiKey = requireKey(
    ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "https://aistudio.google.com/app/apikey",
  );

  const imageDir = join(root, "assets", "images");
  mkdirSync(imageDir, { recursive: true });

  const styleRef = loadStyleReference(root, project.style.slideReference);
  const aspectRatio = project.meta.aspectRatio;

  const results: SlideResult[] = [];
  const scenes: Scene[] = [];

  for (const scene of project.scenes) {
    if (opts.sceneId && scene.id !== opts.sceneId) {
      scenes.push(scene);
      continue;
    }
    const slides: Slide[] = [];
    for (const slide of scene.slides) {
      const handled = await maybeGenerate(slide, scene.id, { apiKey, styleRef, aspectRatio, opts, root });
      slides.push(handled.slide);
      if (handled.result) results.push(handled.result);
    }
    scenes.push({ ...scene, slides });
  }

  if (opts.sceneId && !scenes.some((s) => s.id === opts.sceneId)) {
    throw new PipelineError(`no scene with id "${opts.sceneId}" in this project.`);
  }
  if (opts.slideId && !results.some((r) => r.slideId === opts.slideId)) {
    throw new PipelineError(`no slide with id "${opts.slideId}" found (in the selected scope).`);
  }

  return { project: { ...project, scenes }, results };
}

/** The image-bearing slide a variation run targets, with its scene id. */
function findImageBrief(project: Project, slideId: string): { scene: Scene; slide: ImageSlide } {
  for (const scene of project.scenes) {
    const slide = scene.slides.find((s) => s.id === slideId);
    if (!slide) continue;
    if (slide.layout !== "image" && slide.layout !== "imageText") {
      throw new PipelineError(`slide "${slideId}" is a ${slide.layout} slide — variations only apply to image slides.`);
    }
    return { scene, slide: slide as ImageSlide };
  }
  throw new PipelineError(`no slide with id "${slideId}" in this project.`);
}

/** assets-relative path for variation N of a slide. */
export function variantRelPath(slideId: string, index: number, ext: string): string {
  return `assets/images/${slideId}.v${index}.${ext}`;
}

/** assets-relative canonical image path for a slide (where the chosen image lands). */
export function canonicalImageRelPath(slideId: string, ext: string): string {
  return `assets/images/${slideId}.${ext}`;
}

export type Variation = { index: number; path: string };
export type VariationsResult = { sceneId: string; slideId: string; prompt: string; variants: Variation[] };

/**
 * Generate `count` candidate images for one slide brief into assets/images as
 * `<slideId>.v1.<ext>` … so the user can compare and pick one. Does NOT mutate
 * the project — selection is a separate step (`applyVariation`). Requires the
 * slide to be an image/imageText brief with a prompt.
 */
export async function generateVariations(
  project: Project,
  root: string,
  opts: { slideId: string; count: number; model?: string },
): Promise<VariationsResult> {
  const apiKey = requireKey(["GEMINI_API_KEY", "GOOGLE_API_KEY"], "https://aistudio.google.com/app/apikey");
  const { scene, slide } = findImageBrief(project, opts.slideId);
  const prompt = slide.content.prompt;
  if (!prompt) {
    throw new PipelineError(`slide "${opts.slideId}" has no prompt — nothing to generate variations from.`);
  }

  const imageDir = join(root, "assets", "images");
  mkdirSync(imageDir, { recursive: true });
  const styleRef = loadStyleReference(root, project.style.slideReference);

  const variants: Variation[] = [];
  for (let i = 1; i <= opts.count; i++) {
    const { bytes, ext } = await generateImage(apiKey, prompt, project.meta.aspectRatio, styleRef, opts.model);
    const rel = variantRelPath(opts.slideId, i, ext);
    writeFileSync(join(root, rel), bytes);
    variants.push({ index: i, path: rel });
  }
  return { sceneId: scene.id, slideId: opts.slideId, prompt, variants };
}

/**
 * Adopt one variation as the slide's image: copy it to the canonical
 * `<slideId>.<ext>` path and set the slide's `src`. Returns the updated project;
 * removing the now-unused variant files is the caller's job (it knows the set).
 */
export function applyVariation(
  project: Project,
  root: string,
  slideId: string,
  variantRel: string,
): { project: Project; result: SlideResult } {
  const { scene } = findImageBrief(project, slideId);
  const ext = extname(variantRel).slice(1) || "png";
  const canonRel = canonicalImageRelPath(slideId, ext);
  copyFileSync(join(root, variantRel), join(root, canonRel));

  const scenes = project.scenes.map((s) =>
    s.id !== scene.id
      ? s
      : {
          ...s,
          slides: s.slides.map((sl) =>
            sl.id === slideId ? ({ ...sl, content: { ...(sl as ImageSlide).content, src: canonRel } } as Slide) : sl,
          ),
        },
  );
  return { project: { ...project, scenes }, result: { slideId, sceneId: scene.id, status: "generated", path: canonRel } };
}

async function maybeGenerate(
  slide: Slide,
  sceneId: string,
  ctx: {
    apiKey: string;
    styleRef: InlineImage | null;
    aspectRatio: string;
    opts: SlidesOptions;
    root: string;
  },
): Promise<{ slide: Slide; result?: SlideResult }> {
  if (slide.layout !== "image" && slide.layout !== "imageText") return { slide };
  if (ctx.opts.slideId && slide.id !== ctx.opts.slideId) return { slide };

  const img = slide as ImageSlide;
  if (img.content.src && !ctx.opts.reroll) {
    return { slide, result: { slideId: slide.id, sceneId, status: "skipped" } };
  }
  if (!img.content.prompt) {
    return { slide, result: { slideId: slide.id, sceneId, status: "no-prompt" } };
  }

  const { bytes, ext } = await generateImage(ctx.apiKey, img.content.prompt, ctx.aspectRatio, ctx.styleRef, ctx.opts.model);
  const rel = `assets/images/${slide.id}.${ext}`;
  writeFileSync(join(ctx.root, rel), bytes);

  const next = { ...slide, content: { ...img.content, src: rel } } as Slide;
  return { slide: next, result: { slideId: slide.id, sceneId, status: "generated", path: rel } };
}

export type SetReferenceResult = {
  /** Project-relative path now stored in style.slideReference. */
  reference: string;
  /** Human-readable description of where the reference came from. */
  source: string;
};

/**
 * Point the project's style lock (`style.slideReference`) at an image so every
 * subsequent `slides` call matches its look. `ref` is either a slide id (adopts
 * that slide's current image) or a path to an image file. The image is copied to
 * a stable `assets/refs/style-lock.<ext>` so a later re-roll of the source slide
 * doesn't silently change the reference. Pure spec mutation — generates nothing;
 * run `slides --reroll` afterwards to apply it. No API key needed.
 */
export function setStyleReference(
  project: Project,
  root: string,
  ref: string,
): { project: Project; result: SetReferenceResult } {
  const { absSource, source } = resolveReferenceSource(project, root, ref);
  const ext = extname(absSource).slice(1).toLowerCase() || "png";
  const relDest = `assets/refs/style-lock.${ext}`;
  const absDest = join(root, relDest);
  mkdirSync(join(root, "assets", "refs"), { recursive: true });
  if (resolve(absSource) !== resolve(absDest)) copyFileSync(absSource, absDest);

  const next: Project = { ...project, style: { ...project.style, slideReference: relDest } };
  return { project: next, result: { reference: relDest, source } };
}

/** Resolve `ref` (a slide id or a file path) to an absolute image source. */
function resolveReferenceSource(
  project: Project,
  root: string,
  ref: string,
): { absSource: string; source: string } {
  // 1) A slide id whose current image we adopt as the reference.
  for (const scene of project.scenes) {
    const slide = scene.slides.find((s) => s.id === ref);
    if (!slide) continue;
    if (slide.layout !== "image" && slide.layout !== "imageText") {
      throw new PipelineError(`slide "${ref}" is a ${slide.layout} slide — pick an image/imageText slide or a file path.`);
    }
    const src = (slide as ImageSlide).content.src;
    if (!src) {
      throw new PipelineError(`slide "${ref}" has no image yet — run \`loom slides --slide ${ref}\` first, or pass a file path.`);
    }
    const abs = join(root, src);
    if (!existsSync(abs)) throw new PipelineError(`slide "${ref}" points at "${src}", which is missing on disk.`);
    return { absSource: abs, source: `slide ${ref} (${src})` };
  }
  // 2) A filesystem path — cwd-relative/absolute first, then project-relative.
  for (const cand of [isAbsolute(ref) ? ref : resolve(process.cwd(), ref), join(root, ref)]) {
    if (existsSync(cand)) return { absSource: cand, source: cand };
  }
  throw new PipelineError(`"${ref}" is neither a slide id in this project nor a file that exists.`);
}

type InlineImage = { mimeType: string; data: string };

function loadStyleReference(root: string, ref?: string): InlineImage | null {
  if (!ref) return null;
  const file = join(root, ref);
  if (!existsSync(file)) return null;
  return { mimeType: mimeFromExt(ref), data: readFileSync(file).toString("base64") };
}

async function generateImage(
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  styleRef: InlineImage | null,
  model?: string,
): Promise<{ bytes: Buffer; ext: string }> {
  const parts: Array<Record<string, unknown>> = [];
  if (styleRef) {
    parts.push({ inlineData: styleRef });
    parts.push({
      text: `Match the visual style (palette, lighting, rendering) of the reference image above. Then create: ${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  const url = `${API_BASE}/${model || MODEL}:generateContent?key=${apiKey}`;
  // Image generation is the slowest external call; give it room before timing out.
  const res = await fetchResilient(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
      }),
    },
    { service: "the Gemini API", timeoutMs: 120_000 },
  );
  if (!res.ok) {
    throw new PipelineError(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = await readJson<{
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  }>(res, "the Gemini API");
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const inline = part?.inlineData;
  if (!inline?.data) {
    throw new PipelineError(`Gemini returned no image for prompt: "${prompt.slice(0, 80)}…"`);
  }
  return { bytes: Buffer.from(inline.data, "base64"), ext: extFromMime(inline.mimeType) };
}

function mimeFromExt(path: string): string {
  const e = extname(path).toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  return "image/png";
}

function extFromMime(mime?: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}
