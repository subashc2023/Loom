import { PipelineError } from "./errors";
import { qualityScore, type StockCandidate, USER_AGENT } from "./commons";

/**
 * Openverse image search (https://openverse.org). Openverse aggregates openly
 * licensed images from ~50 sources — Flickr, museums (the Met, Cleveland,
 * Smithsonian), NASA, Wikimedia, and more — so it reaches far past Commons for
 * generic photos and aesthetic backdrops that Commons only serves as
 * subject-tagged stock. No API key is required (anonymous calls are rate
 * limited; failures here are non-fatal and just leave Commons to answer).
 *
 * We let the API do the licence filtering: `license_type=commercial,modification`
 * keeps only images that are both commercially usable and modifiable — exactly
 * our constraint, since we crop, Ken-Burns, and overlay text. Openverse exposes
 * no community-assessment or wiki-usage signal, so its candidates rank purely on
 * resolution and therefore sit below any *assessed* Commons image — which is the
 * honest ordering.
 */

const OPENVERSE_API = "https://api.openverse.org/v1/images/";
const ALLOWED_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type OpenverseOptions = {
  /** Max candidates to return (default 8). */
  limit?: number;
  /** Minimum width in px to keep (default 1000). */
  minWidth?: number;
};

/** Search Openverse for `query` and return candidates ranked best-first. */
export async function searchOpenverse(query: string, opts: OpenverseOptions = {}): Promise<StockCandidate[]> {
  const limit = opts.limit ?? 8;
  const minWidth = opts.minWidth ?? 1000;

  const params = new URLSearchParams({
    q: query,
    license_type: "commercial,modification", // commercially usable AND modifiable
    page_size: "20", // anonymous ceiling; raising it needs a registered API token
    mature: "false",
  });

  let res: Response;
  try {
    res = await fetch(`${OPENVERSE_API}?${params}`, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  } catch (e) {
    throw new PipelineError(`could not reach Openverse: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new PipelineError(`Openverse API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as OpenverseResponse;
  const candidates = (data.results ?? [])
    .map(toCandidate)
    .filter((c): c is StockCandidate => c !== null && c.width >= minWidth);

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// --- internals ---------------------------------------------------------------

type OpenverseResult = {
  id?: string;
  title?: string;
  creator?: string;
  url?: string;
  thumbnail?: string;
  foreign_landing_url?: string;
  license?: string;
  license_version?: string;
  width?: number;
  height?: number;
  filetype?: string;
  source?: string;
};
type OpenverseResponse = { results?: OpenverseResult[] };

/** Map one Openverse result onto a {@link StockCandidate}. Exported for testing. */
export function toCandidate(r: OpenverseResult): StockCandidate | null {
  if (!r.url || !r.width || !r.height) return null;
  const mime = mimeOf(r.filetype, r.url);
  if (!mime) return null; // skip svg/gif/tiff/unknown — renderer wants a normal raster

  const width = r.width;
  const height = r.height;
  return {
    provider: "openverse",
    sourceName: "Openverse",
    title: (r.title ?? "Untitled").trim().slice(0, 120),
    pageUrl: r.foreign_landing_url ?? r.url,
    imageUrl: r.url,
    thumbUrl: r.thumbnail ?? r.url,
    width,
    height,
    mime,
    license: formatLicense(r.license, r.license_version),
    author: r.creator?.trim() ? r.creator.trim().slice(0, 120) : null,
    assessment: null,
    usageCount: 0,
    isVector: false,
    score: qualityScore({ assessment: null, usageCount: 0, width, height }),
  };
}

/** "CC BY 2.0" from license="by", version="2.0"; "CC0" / "Public domain" handled. Exported for testing. */
export function formatLicense(license: string | undefined, version: string | undefined): string | null {
  if (!license) return null;
  const l = license.toLowerCase();
  if (l === "cc0") return "CC0";
  if (l === "pdm") return "Public domain";
  const v = version ? ` ${version}` : "";
  return `CC ${l.toUpperCase()}${v}`; // by → "CC BY 2.0", by-sa → "CC BY-SA 4.0"
}

function mimeOf(filetype: string | undefined, url: string): string | null {
  const ext = (filetype ?? url.split("?")[0]!.split(".").pop() ?? "").toLowerCase();
  return ALLOWED_EXT[ext] ?? null;
}
