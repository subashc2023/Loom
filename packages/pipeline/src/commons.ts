import { writeFileSync } from "node:fs";
import { PipelineError } from "./errors";

/**
 * Wikimedia Commons image search, ranked by an *authoritative* quality signal so
 * we surface only good images without eyeballing every hit. Commons community
 * assessments are the heart of it:
 *   - Featured pictures — the top ~1% by a formal vote.
 *   - Quality images — peer-reviewed for technical quality.
 *   - Valued images — the most valuable illustration of its subject.
 * After assessment, we rank by global usage (how many wiki pages actually use the
 * image — a strong "vetted + relevant" proxy) and then by resolution.
 *
 * Only freely-reusable, raster images are returned: NC/ND-restricted licences are
 * dropped (we crop/Ken-Burns/overlay, so no-derivatives is out), and so are SVG
 * "drawings" the MP4 renderer can't display. The query is the plain keywords the
 * planner emits per slide. No API key required.
 */

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks every client to send a descriptive User-Agent.
export const USER_AGENT = "LoomVideo/0.1 (https://github.com/loom-video; image sourcing for an AI video pipeline)";

const ALLOWED_RASTER = new Set(["image/jpeg", "image/png", "image/webp"]);
// Width (px) we render vector (SVG) diagrams to when adopting one. Commons' own
// thumbnail server rasterises SVGs to PNG, so we never need a local rasteriser.
const VECTOR_RASTER_WIDTH = 1920;

export type Assessment = "featured" | "quality" | "valued" | null;

/** Which public library a candidate came from. */
export type StockProvider = "commons" | "openverse";

/**
 * A ranked image candidate from any provider. Commons and Openverse both map
 * onto this shape so they can be merged into one ranked list. Fields that a
 * provider doesn't expose default sensibly (Openverse has no community
 * assessment or wiki-usage count, so those are `null`/`0`).
 */
export type StockCandidate = {
  provider: StockProvider;
  /** Display + attribution name, e.g. "Wikimedia Commons" or "Openverse". */
  sourceName: string;
  /** File/work title. */
  title: string;
  /** The work's description/source/landing page. */
  pageUrl: string;
  /** URL to download the adopted image (a PNG render URL for vectors). */
  imageUrl: string;
  /** A downscaled thumbnail URL (for quick review). */
  thumbUrl: string;
  width: number;
  height: number;
  mime: string;
  /** Human-readable licence, e.g. "CC BY 4.0", "Public domain". */
  license: string | null;
  /** Plain-text author/uploader (HTML stripped). */
  author: string | null;
  /** Highest community assessment the file holds, if any (Commons only). */
  assessment: Assessment;
  /** How many wiki pages use the image (Commons only; vetted-relevance proxy). */
  usageCount: number;
  /** True for vector (SVG) sources rasterised to PNG on adopt. */
  isVector: boolean;
  /** Composite score used for ranking (assessment ≫ usage ≫ resolution). */
  score: number;
};

/** @deprecated use {@link StockCandidate} — kept as an alias for back-compat. */
export type CommonsCandidate = StockCandidate;

export type SearchOptions = {
  /** Max ranked candidates to return (default 8). */
  limit?: number;
  /** Thumbnail width in px to request (default 480). */
  thumbWidth?: number;
  /** Minimum original width in px to keep (default 1000). */
  minWidth?: number;
};

/** Search Commons for `query` and return candidates ranked best-first. */
export async function searchCommons(query: string, opts: SearchOptions = {}): Promise<StockCandidate[]> {
  const limit = opts.limit ?? 8;
  const thumbWidth = opts.thumbWidth ?? 480;
  const minWidth = opts.minWidth ?? 1000;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6", // File:
    gsrlimit: "30",
    prop: "imageinfo|categories|globalusage",
    iiprop: "url|size|mime|mediatype|extmetadata",
    iiurlwidth: String(thumbWidth),
    cllimit: "max",
    gulimit: "200",
  });

  let res: Response;
  try {
    res = await fetch(`${COMMONS_API}?${params}`, { headers: { "user-agent": USER_AGENT } });
  } catch (e) {
    throw new PipelineError(`could not reach Wikimedia Commons: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new PipelineError(`Wikimedia Commons API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as CommonsResponse;
  if (data.error) {
    throw new PipelineError(`Wikimedia Commons API error: ${data.error.info ?? data.error.code}`);
  }

  const pages = data.query?.pages ?? [];
  const candidates = pages
    .map(toCandidate)
    // Vectors rasterise to any size we ask for, so the min-width floor (a
    // resolution guard for photos) doesn't apply to them.
    .filter((c): c is StockCandidate => c !== null && (c.isVector || c.width >= minWidth));

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

/** Download an image to `dest`. Used to fetch a chosen candidate's full image. */
export async function downloadImage(url: string, dest: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  } catch (e) {
    throw new PipelineError(`could not download image: ${(e as Error).message}`);
  }
  if (!res.ok) throw new PipelineError(`failed to download image (${res.status}) from ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// --- internals ---------------------------------------------------------------

type ExtMeta = Record<string, { value?: string } | undefined>;
type CommonsPage = {
  title: string;
  imageinfo?: Array<{
    url?: string;
    descriptionurl?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
    mediatype?: string;
    extmetadata?: ExtMeta;
  }>;
  categories?: Array<{ title: string }>;
  globalusage?: Array<unknown>;
};
type CommonsResponse = {
  error?: { code?: string; info?: string };
  query?: { pages?: CommonsPage[] };
};

const ASSESSMENT_RANK: Record<Exclude<Assessment, null>, number> = { featured: 3, quality: 2, valued: 1 };

/**
 * Composite ranking score in a strict tier order: a community assessment beats
 * any amount of usage, and usage beats any resolution. Exported for testing.
 */
export function qualityScore(c: { assessment: Assessment; usageCount: number; width: number; height: number }): number {
  const megapixels = (c.width * c.height) / 1_000_000;
  return (
    (c.assessment ? ASSESSMENT_RANK[c.assessment] : 0) * 1_000_000 +
    Math.min(c.usageCount, 500) * 1000 +
    Math.min(megapixels, 100)
  );
}

function toCandidate(page: CommonsPage): StockCandidate | null {
  const ii = page.imageinfo?.[0];
  if (!ii?.url || !ii.thumburl || !ii.width || !ii.height || !ii.mime) return null;

  // Accept raster photos and SVG diagrams. SVGs ("DRAWING") are rasterised to
  // PNG by Commons' own thumbnail server, so we adopt a PNG render rather than
  // the raw .svg. Everything else (video/audio/PDF) is out.
  const isVector = ii.mime === "image/svg+xml" || ii.mediatype === "DRAWING";
  if (!isVector && (ii.mediatype !== "BITMAP" || !ALLOWED_RASTER.has(ii.mime))) return null;
  if (isVector && ii.mime !== "image/svg+xml") return null; // some "DRAWING" entries are PDFs etc.

  const meta = ii.extmetadata ?? {};
  const licenseCode = meta.License?.value ?? null;
  const license = meta.LicenseShortName?.value ?? null;
  if (!isFreeLicense(licenseCode, license)) return null;

  const assessment = assessmentOf(page.categories ?? []);
  const usageCount = page.globalusage?.length ?? 0;
  const score = qualityScore({ assessment, usageCount, width: ii.width, height: ii.height });

  return {
    provider: "commons",
    sourceName: "Wikimedia Commons",
    title: page.title,
    pageUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    // For vectors, adopt a high-res PNG render (derived from the thumb URL);
    // for raster, the original file.
    imageUrl: isVector ? rasterUrl(ii.thumburl, VECTOR_RASTER_WIDTH) : ii.url,
    thumbUrl: ii.thumburl,
    width: ii.width,
    height: ii.height,
    mime: isVector ? "image/png" : ii.mime,
    license,
    author: cleanAuthor(meta.Artist?.value),
    assessment,
    usageCount,
    isVector,
    score,
  };
}

/**
 * Turn a Commons thumbnail URL into one for a render at `width` px. Commons
 * thumb URLs embed the width as a `/<N>px-` path segment, e.g.
 * `…/Foo.svg/480px-Foo.svg.png` → `…/Foo.svg/1920px-Foo.svg.png`. Exported for
 * testing. Returns the input unchanged if the pattern isn't present.
 */
export function rasterUrl(thumbUrl: string, width: number): string {
  return thumbUrl.replace(/\/\d+px-/, `/${width}px-`);
}

/** Highest community assessment implied by a file's categories. Exported for testing. */
export function assessmentOf(categories: Array<{ title: string }>): Assessment {
  let best: Assessment = null;
  for (const { title } of categories) {
    const t = title.toLowerCase();
    if (t.includes("featured pictures")) return "featured"; // top tier — short-circuit
    if (t.includes("quality images") && best !== "quality") best = "quality";
    else if (t.includes("valued images") && best === null) best = "valued";
  }
  return best;
}

/**
 * Accept only freely-reusable licences. NC (non-commercial) and ND (no
 * derivatives) are rejected because we crop, animate, and overlay text. Public
 * domain, CC0, and CC-BY / CC-BY-SA are allowed; anything unrecognised is dropped
 * rather than risk an attribution we can't honour. Exported for testing.
 */
export function isFreeLicense(code: string | null, short: string | null): boolean {
  const c = (code ?? "").toLowerCase();
  const s = (short ?? "").toLowerCase();
  if (/\bnc\b|noncommercial|\bnd\b|noderiv|no.deriv/.test(c) || /\bnc\b|noncommercial|no deriv/.test(s)) return false;
  if (c.startsWith("cc-by") || c === "cc0" || c === "pd" || c.startsWith("pd-") || c.startsWith("cc-pd")) return true;
  if (/public domain|^cc0|^cc[ -]by|^attribution/.test(s)) return true;
  return false;
}

/** Strip the HTML Commons wraps author fields in down to plain text. */
function cleanAuthor(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 120) : null;
}
