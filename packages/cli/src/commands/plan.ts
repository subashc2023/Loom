import { getTemplate, loadEnv, planVideo } from "@loom/pipeline";
import { log, c, fail } from "../log";
import { loadProject, resolveProjectRoot, saveProject } from "../project-io";
import { printScenes } from "../summary";

/**
 * `loom plan "<prompt>"` — Opus turns a prompt into a structured multi-scene spec
 * (narration + slide briefs) and writes it to project.json, preserving the
 * project's id and resolution. A --template steers the plan and applies its style
 * preset. Run `script`/`voice`/`slides` next.
 */
export async function plan(
  args: string[],
  opts: { project?: string; model?: string; scenes?: number; template?: string },
): Promise<void> {
  const prompt = args.join(" ").trim();
  if (!prompt) fail('usage: loom plan "<prompt>"');

  const root = resolveProjectRoot(opts.project);
  loadEnv(root);
  const base = loadProject(root);
  const template = opts.template ? getTemplate(opts.template) : undefined;

  if (base.scenes.length > 0) {
    log.warn(`this will replace the ${base.scenes.length} existing scene(s) in this project.`);
  }

  const tag = template ? ` ${c.dim(`[${template.label}]`)}` : "";
  log.step(`planning ${c.dim(`"${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}"`)}${tag}`);
  const project = await planVideo(prompt, { base, model: opts.model, scenes: opts.scenes, template });
  saveProject(root, project);

  printScenes(project);
  log.ok(`planned ${c.bold(`${project.scenes.length} scenes`)} → ${c.dim("project.json")}`);
  log.step("next: loom script   then   loom voice   and   loom slides");
}
