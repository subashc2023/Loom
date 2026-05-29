import { searchCommons, type StockCandidate } from "./commons";
import { searchOpenverse } from "./openverse";

/**
 * The unified search across every public image library. It queries Wikimedia
 * Commons and Openverse in parallel, dedups (Openverse re-serves a lot of
 * Commons content), ranks the combined pool with one comparable score, and
 * returns the best-first slice. Each provider's scores share a scale —
 * assessment ≫ usage ≫ resolution — so an *assessed* Commons image always wins,
 * an in-use Commons image beats a bare photo, and otherwise the highest
 * resolution wins regardless of source.
 *
 * A provider that errors (network, rate limit) is skipped rather than failing
 * the search — as long as one provider answers, we get candidates.
 */

export type StockSearchOptions = {
  /** Max ranked candidates to return (default 8). */
  limit?: number;
  /** Minimum original width in px to keep (default 1000). */
  minWidth?: number;
  /** Restrict to specific providers (default: all). */
  providers?: Array<"commons" | "openverse">;
};

export async function searchStock(query: string, opts: StockSearchOptions = {}): Promise<StockCandidate[]> {
  const limit = opts.limit ?? 8;
  const providers = opts.providers ?? ["commons", "openverse"];
  // Over-fetch per provider so dedup + cross-provider ranking still leaves a full slice.
  const perProvider = { limit: Math.max(limit * 2, 8), minWidth: opts.minWidth };

  const jobs: Array<Promise<StockCandidate[]>> = [];
  if (providers.includes("commons")) jobs.push(searchCommons(query, perProvider).catch(() => []));
  if (providers.includes("openverse")) jobs.push(searchOpenverse(query, perProvider).catch(() => []));

  const pooled = (await Promise.all(jobs)).flat();
  const deduped = dedupeStock(pooled);
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}

/**
 * Drop cross-provider duplicates (Openverse mirrors much of Commons). Keyed on a
 * normalised filename so the same underlying file collapses to one entry; when
 * two providers carry it, Commons wins because it brings assessment + usage
 * metadata. Exported for testing.
 */
export function dedupeStock(candidates: StockCandidate[]): StockCandidate[] {
  const best = new Map<string, StockCandidate>();
  for (const c of candidates) {
    const key = dedupKey(c);
    const prior = best.get(key);
    if (!prior || preferOver(c, prior)) best.set(key, c);
  }
  return [...best.values()];
}

function preferOver(c: StockCandidate, prior: StockCandidate): boolean {
  if (c.provider === prior.provider) return c.score > prior.score;
  return c.provider === "commons"; // Commons brings the richer metadata
}

function dedupKey(c: StockCandidate): string {
  const raw = c.provider === "commons" ? c.title.replace(/^File:/, "") : basename(c.imageUrl);
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    /* keep raw if it isn't valid percent-encoding */
  }
  return name
    .replace(/\.[a-z0-9]+$/i, "") // drop extension
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();
}

function basename(url: string): string {
  const path = url.split("?")[0]!.split("#")[0]!;
  return path.slice(path.lastIndexOf("/") + 1);
}
