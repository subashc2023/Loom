import { applyEmphasisCuts, cutTimesMs, sceneDurationMs, type Project } from "@loom/spec";
import { PipelineError } from "./errors";

export type CutResult = {
  sceneId: string;
  slides: number;
  /** Number of cut beats (emphasis/punchline/slide-change) used for boundaries. */
  cuts: number;
  status: "cut" | "skipped";
};

/**
 * `cut` — distribute each scene's slides across its duration, cutting to the next
 * slide on `emphasis`/`punchline`/`slide-change` beats. A pure spec mutation: it
 * only rewrites slide `startMs`/`durationMs`, leaving content and order intact.
 * Scenes with 0–1 slides are skipped (nothing to cut between). Narrow with
 * `sceneId`.
 */
export function applyCuts(project: Project, opts: { sceneId?: string } = {}): { project: Project; results: CutResult[] } {
  if (opts.sceneId && !project.scenes.some((s) => s.id === opts.sceneId)) {
    throw new PipelineError(`no scene with id "${opts.sceneId}" in this project.`);
  }

  const results: CutResult[] = [];
  const scenes = project.scenes.map((scene) => {
    if (opts.sceneId && scene.id !== opts.sceneId) return scene;
    if (scene.slides.length <= 1) {
      results.push({ sceneId: scene.id, slides: scene.slides.length, cuts: 0, status: "skipped" });
      return scene;
    }
    const cuts = cutTimesMs(scene, sceneDurationMs(scene)).length;
    results.push({ sceneId: scene.id, slides: scene.slides.length, cuts, status: "cut" });
    return applyEmphasisCuts(scene);
  });

  return { project: { ...project, scenes }, results };
}
