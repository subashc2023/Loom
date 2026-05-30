import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { ImageCredit, Project, Scene, Slide } from "@loom/spec";
import { downloadImage, type StockCandidate } from "./commons";
import { PipelineError } from "./errors";
import { searchStock } from "./stock";

/**
 * `source` finds REAL images for slide briefs from a public library (Wikimedia
 * Commons) instead of generating them. It runs in two steps so a human (or the
 * agent) stays in the loop on quality:
 *   1. `findStockCandidates` searches per slide, ranks by quality, downloads a few
 *      top thumbnails plus a manifest — so you review only a handful, not the web.
 *   2. `applyStock` adopts a chosen candidate: it downloads the full image and
 *      sets the slide's `src` + `credit`.
 * Slides with no good real match are simply left as briefs for `slides` (Gemini)
 * to fill — that's the gap-filling hybrid. This stage never calls an AI model.
 */

type ImageSlide = Extract<Slide, { layout: "image" | "imageText" }>;

export type SourceCandidate = StockCandidate & {
  /** 1-based position in the ranked list (what `--pick` takes). */
  index: number;
  /** Project-relative path to the downloaded thumbnail, for quick review. */
  thumbPath: string;
};

export type SourceResult =
  | { slideId: string; sceneId: string; status: "found"; query: string; candidates: SourceCandidate[] }
  | { slideId: string; sceneId: string; status: "none"; query: string; reason: string }
  | { slideId: string; sceneId: string; status: "skipped"; reason: string };

export type SourceOptions = {
  sceneId?: string;
  slideId?: string;
  /** Override the search keywords for a single targeted slide. */
  query?: string;
  /** How many candidates to fetch per slide (default 6). */
  limit?: number;
  /** Re-search even slides that already have an image. */
  reroll?: boolean;
};

type Manifest = { slideId: string; sceneId: string; query: string; candidates: StockCandidate[] };

/**
 * Search Commons for every in-scope image brief, rank, and stage the top
 * candidates (thumbnails + manifest) for review. Does NOT mutate the project.
 */
export async function findStockCandidates(
  project: Project,
  root: string,
  opts: SourceOptions = {},
): Promise<SourceResult[]> {
  const limit = opts.limit ?? 6;
  const targets = imageSlidesInScope(project, opts);
  if (opts.slideId && targets.length === 0) {
    throw new PipelineError(`no image/imageText slide with id "${opts.slideId}" in the selected scope.`);
  }

  const results: SourceResult[] = [];
  for (const { scene, slide } of targets) {
    if (slide.content.src && !opts.reroll && !opts.slideId) {
      results.push({ slideId: slide.id, sceneId: scene.id, status: "skipped", reason: "already has an image" });
      continue;
    }
    const query = (opts.slideId ? opts.query : undefined) ?? slideQuery(slide);
    if (!query) {
      results.push({ slideId: slide.id, sceneId: scene.id, status: "skipped", reason: "no search query on this slide" });
      continue;
    }

    let ranked: StockCandidate[];
    try {
      ranked = await searchStock(query, { limit });
    } catch (e) {
      results.push({ slideId: slide.id, sceneId: scene.id, status: "none", query, reason: (e as Error).message });
      continue;
    }
    if (ranked.length === 0) {
      results.push({ slideId: slide.id, sceneId: scene.id, status: "none", query, reason: "no usable matches" });
      continue;
    }

    const dir = candidateDir(root, slide.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const candidates: SourceCandidate[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const cand = ranked[i]!;
      const index = i + 1;
      const thumbRel = `assets/refs/candidates/${slide.id}/${index}${extFromUrl(cand.thumbUrl) || ".jpg"}`;
      try {
        await downloadImage(cand.thumbUrl, join(root, thumbRel));
      } catch {
        continue; // a dead thumbnail shouldn't sink the whole slide
      }
      candidates.push({ ...cand, index, thumbPath: thumbRel });
    }

    writeManifest(root, { slideId: slide.id, sceneId: scene.id, query, candidates: ranked });
    results.push({ slideId: slide.id, sceneId: scene.id, status: "found", query, candidates });
  }
  return results;
}

/**
 * Adopt candidate `index` for a slide: download its full-resolution image to the
 * canonical assets path and set the slide's `src` + `credit`. Reads the manifest
 * written by `findStockCandidates`.
 */
export async function applyStock(
  project: Project,
  root: string,
  slideId: string,
  index: number,
): Promise<{ project: Project; result: { slideId: string; sceneId: string; path: string; credit: ImageCredit } }> {
  const manifest = readManifest(root, slideId);
  if (!manifest) {
    throw new PipelineError(`no candidates staged for "${slideId}" — run \`loom source --slide ${slideId}\` first.`);
  }
  const cand = manifest.candidates[index - 1];
  if (!cand) {
    throw new PipelineError(`candidate ${index} doesn't exist for "${slideId}" (have 1-${manifest.candidates.length}).`);
  }

  const { scene } = findImageSlide(project, slideId); // validates id + that it's an image slide
  const ext = extFromUrl(cand.imageUrl) || mimeExt(cand.mime);
  const rel = `assets/images/${slideId}${ext}`;
  mkdirSync(join(root, "assets", "images"), { recursive: true });
  await downloadImage(cand.imageUrl, join(root, rel));

  const credit: ImageCredit = {
    source: cand.sourceName,
    title: cand.title.replace(/^File:/, ""),
    ...(cand.author ? { author: cand.author } : {}),
    ...(cand.license ? { license: cand.license } : {}),
    url: cand.pageUrl,
  };

  // A vector (SVG) source is a diagram on a plain/transparent background. Cover-
  // cropping or Ken Burns would slice it to an unreadable fragment, so show it
  // whole and still: fit "contain" + no motion. Photos keep cover + auto motion.
  const vector = cand.isVector;
  const scenes = project.scenes.map((s) =>
    s.id !== scene.id
      ? s
      : {
          ...s,
          slides: s.slides.map((sl) =>
            sl.id === slideId
              ? ({
                  ...sl,
                  ...(vector ? { motion: { type: "none" as const } } : {}),
                  content: {
                    ...(sl as ImageSlide).content,
                    src: rel,
                    credit,
                    ...(vector ? { fit: "contain" as const } : {}),
                  },
                } as Slide)
              : sl,
          ),
        },
  );
  return { project: { ...project, scenes }, result: { slideId, sceneId: scene.id, path: rel, credit } };
}

/** Lines for a CREDITS file: one per sourced image, so attribution is recorded. */
export function collectCredits(project: Project): Array<{ slideId: string; credit: ImageCredit }> {
  const out: Array<{ slideId: string; credit: ImageCredit }> = [];
  for (const scene of project.scenes) {
    for (const slide of scene.slides) {
      if (slide.layout !== "image" && slide.layout !== "imageText") continue;
      const credit = (slide as ImageSlide).content.credit;
      if (credit) out.push({ slideId: slide.id, credit });
    }
  }
  return out;
}

// --- internals ---------------------------------------------------------------

function imageSlidesInScope(project: Project, opts: SourceOptions): Array<{ scene: Scene; slide: ImageSlide }> {
  const out: Array<{ scene: Scene; slide: ImageSlide }> = [];
  for (const scene of project.scenes) {
    if (opts.sceneId && scene.id !== opts.sceneId) continue;
    for (const slide of scene.slides) {
      if (slide.layout !== "image" && slide.layout !== "imageText") continue;
      if (opts.slideId && slide.id !== opts.slideId) continue;
      out.push({ scene, slide: slide as ImageSlide });
    }
  }
  return out;
}

function findImageSlide(project: Project, slideId: string): { scene: Scene; slide: ImageSlide } {
  for (const scene of project.scenes) {
    const slide = scene.slides.find((s) => s.id === slideId);
    if (!slide) continue;
    if (slide.layout !== "image" && slide.layout !== "imageText") {
      throw new PipelineError(`slide "${slideId}" is a ${slide.layout} slide — sourcing only applies to image slides.`);
    }
    return { scene, slide: slide as ImageSlide };
  }
  throw new PipelineError(`no slide with id "${slideId}" in this project.`);
}

/** Search keywords for a slide: explicit query wins, else alt text, else the brief. */
function slideQuery(slide: ImageSlide): string | null {
  const c = slide.content;
  if (c.query?.trim()) return c.query.trim();
  if ("alt" in c && c.alt?.trim()) return c.alt.trim();
  if (c.prompt?.trim()) return c.prompt.trim().split(/[.,;]/)[0]!.slice(0, 80);
  return null;
}

function candidateDir(root: string, slideId: string): string {
  return join(root, "assets", "refs", "candidates", slideId);
}

function writeManifest(root: string, manifest: Manifest): void {
  writeFileSync(join(candidateDir(root, manifest.slideId), "manifest.json"), JSON.stringify(manifest, null, 2));
}

function readManifest(root: string, slideId: string): Manifest | null {
  const file = join(candidateDir(root, slideId), "manifest.json");
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new PipelineError(
      `the staged candidates for "${slideId}" are corrupt (${(e as Error).message}). ` +
        `Re-run \`loom source --slide ${slideId}\` to regenerate them.`,
    );
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Manifest).candidates)) {
    throw new PipelineError(
      `the staged candidates for "${slideId}" are malformed. Re-run \`loom source --slide ${slideId}\`.`,
    );
  }
  return parsed as Manifest;
}

/** Extension (with dot) from a URL's path, or "" if none/unknown. */
function extFromUrl(url: string): string {
  try {
    const e = extname(new URL(url).pathname).toLowerCase();
    return /^\.(jpe?g|png|webp)$/.test(e) ? (e === ".jpeg" ? ".jpg" : e) : "";
  } catch {
    return "";
  }
}

function mimeExt(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}
