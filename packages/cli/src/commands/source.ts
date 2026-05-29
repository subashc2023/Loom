import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyStock,
  collectCredits,
  findStockCandidates,
  loadEnv,
  type SourceCandidate,
  type SourceResult,
} from "@loom/pipeline";
import { log, c, fail } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";

/**
 * `loom source` — find REAL images for slide briefs from public libraries
 * (Wikimedia Commons + Openverse), ranked by quality
 * (Featured/Quality/Valued > usage > resolution). SVG diagrams from Commons are
 * rasterised to PNG so they can be used too.
 *
 *   loom source                       stage top candidates for every image brief
 *   loom source --slide s2-1          stage candidates for one slide
 *   loom source --slide s2-1 --query "ocean sunset"   override the search terms
 *   loom source --slide s2-1 --pick 2 adopt candidate #2 (full image + credit)
 *   loom source --auto                auto-adopt the #1 candidate for each brief
 *
 * The list step downloads a few thumbnails into assets/refs/candidates/<slide>/
 * so you review a handful, not the whole web. Slides with no good match stay
 * briefs for `loom slides` (Gemini) to fill.
 */
export async function source(opts: {
  project?: string;
  scene?: string;
  slide?: string;
  query?: string;
  pick?: number;
  auto?: boolean;
  limit?: number;
  reroll?: boolean;
}): Promise<void> {
  const root = resolveProjectRoot(opts.project);
  loadEnv(root);
  const project = loadProject(root);

  if (opts.pick !== undefined) {
    if (!opts.slide) fail("--pick needs --slide <id> (it adopts one candidate for one slide)");
    const { project: updated, result } = await applyStock(project, root, opts.slide, opts.pick);
    saveProject(root, updated);
    rmSync(join(root, "assets", "refs", "candidates", opts.slide), { recursive: true, force: true });
    writeCredits(root, updated);
    log.ok(`adopted candidate ${c.bold(String(opts.pick))} for ${c.bold(opts.slide)} → ${c.dim(result.path)}`);
    log.info(`  ${c.dim(creditLine(result.credit))}`);
    return;
  }

  log.step(opts.auto ? "sourcing real images from Commons + Openverse (auto-adopt)…" : "searching Commons + Openverse…");
  const results = await findStockCandidates(project, root, {
    sceneId: opts.scene,
    slideId: opts.slide,
    query: opts.query,
    limit: opts.limit,
    reroll: opts.reroll,
  });

  log.info("");
  for (const r of results) printSlide(r);
  log.info("");

  if (opts.auto) {
    await autoAdopt(root, project, results);
    return;
  }

  const found = results.filter((r) => r.status === "found").length;
  if (found > 0) {
    log.ok(`staged candidates for ${c.bold(`${found} slide(s)`)} in ${c.dim("assets/refs/candidates/")}`);
    log.step(`review the thumbnails, then adopt one:  ${c.bold("loom source --slide <id> --pick <n>")}`);
    log.info(`  ${c.dim("slides with no good match: leave them and run `loom slides` to fill with Gemini.")}`);
  } else {
    log.info("no real-image matches — run `loom slides` to generate these with Gemini.");
  }
}

/** Adopt the #1 candidate for every slide that found matches; thread the project through. */
async function autoAdopt(root: string, project: ReturnType<typeof loadProject>, results: SourceResult[]): Promise<void> {
  let current = project;
  let adopted = 0;
  for (const r of results) {
    if (r.status !== "found") continue;
    const { project: updated, result } = await applyStock(current, root, r.slideId, 1);
    current = updated;
    adopted++;
    rmSync(join(root, "assets", "refs", "candidates", r.slideId), { recursive: true, force: true });
    log.info(`  ${c.green("✓")} ${r.slideId.padEnd(7)} ${c.dim(result.path)}  ${c.dim(creditLine(result.credit))}`);
  }
  saveProject(root, current);
  writeCredits(root, current);
  log.info("");
  log.ok(`auto-adopted ${c.bold(`${adopted} image(s)`)}; gaps remain briefs for ${c.bold("loom slides")}.`);
}

function printSlide(r: SourceResult): void {
  if (r.status === "skipped") {
    log.info(`  ${c.dim("·")} ${r.slideId.padEnd(7)} ${c.dim(`skipped — ${r.reason}`)}`);
    return;
  }
  if (r.status === "none") {
    log.info(`  ${c.dim("·")} ${r.slideId.padEnd(7)} ${c.dim(`no match for "${r.query}" — ${r.reason}`)}`);
    return;
  }
  log.info(`  ${c.cyan(r.slideId)}  ${c.dim(`"${r.query}"`)}`);
  for (const cand of r.candidates) log.info(`     ${candidateRow(cand)}`);
}

function candidateRow(cand: SourceCandidate): string {
  const badge = cand.assessment ? c.yellow(`[${cand.assessment}]`) : c.dim("[—]");
  const res = cand.isVector ? `${cand.width}×${cand.height}→svg` : `${cand.width}×${cand.height}`;
  const lic = cand.license ?? "?";
  const who = cand.author ? ` · ${cand.author}` : "";
  const src = c.dim(`${cand.provider === "commons" ? "commons" : "openverse"}`);
  return `${c.bold(String(cand.index))} ${badge} ${res.padEnd(13)} ${src} ${c.dim(`use:${cand.usageCount}`)} ${c.dim(lic)}${c.dim(who)}\n        ${c.dim(cand.thumbPath)}`;
}

function creditLine(credit: { title: string; author?: string; license?: string; source: string }): string {
  return [credit.title, credit.author, credit.license, `(${credit.source})`].filter(Boolean).join(" · ");
}

/** Write a CREDITS.md recording attribution for every sourced image. */
function writeCredits(root: string, project: ReturnType<typeof loadProject>): void {
  const credits = collectCredits(project);
  if (credits.length === 0) return;
  const lines = [
    `# Image credits — ${project.meta.title}`,
    "",
    "Real images sourced from public libraries, with attribution as their licences require.",
    "",
    ...credits.map(({ slideId, credit }) => {
      const parts = [`**${credit.title}**`, credit.author, credit.license, credit.source].filter(Boolean).join(" · ");
      const link = credit.url ? ` — <${credit.url}>` : "";
      return `- \`${slideId}\`: ${parts}${link}`;
    }),
    "",
  ];
  writeFileSync(join(root, "CREDITS.md"), lines.join("\n"), "utf8");
}
