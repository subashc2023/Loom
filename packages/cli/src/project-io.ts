import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { safeParseProject, type Project } from "@loom/spec";
import { fail } from "./log";

export const PROJECT_FILE = "project.json";

/**
 * Where `loom init` puts new projects, relative to the repo root. This dir is
 * gitignored so the code repo can be shared without shipping individual runs.
 */
export const PROJECTS_DIR = "projects";

/** Absolute path to a project's project.json, given its root dir. */
export function projectFilePath(root: string): string {
  return join(root, PROJECT_FILE);
}

/**
 * Resolve the project root from an optional --project value (defaults to cwd).
 *
 * For ergonomics from the repo root, a bare relative name (e.g. `-p my-video`)
 * that doesn't resolve to a project at the cwd but does under `projects/` is
 * taken to mean the one in `projects/`. Absolute paths and the cwd default are
 * used as-is, so `cd projects/my-video && loom render` keeps working unchanged.
 */
export function resolveProjectRoot(explicit?: string): string {
  if (!explicit) return process.cwd();
  if (isAbsolute(explicit)) return explicit;

  const direct = resolve(process.cwd(), explicit);
  if (existsSync(projectFilePath(direct))) return direct;

  const nested = resolve(process.cwd(), PROJECTS_DIR, explicit);
  if (existsSync(projectFilePath(nested))) return nested;

  return direct;
}

/**
 * Load and validate a project from its root dir. Exits with readable schema
 * issues on failure — the CLI should never throw a raw ZodError at the user.
 */
export function loadProject(root: string): Project {
  const file = projectFilePath(root);
  if (!existsSync(file)) {
    fail(`no ${PROJECT_FILE} found in ${root}. Run \`loom init <name>\` first.`);
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (e) {
    fail(`could not read ${file}: ${(e as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`${PROJECT_FILE} is not valid JSON: ${(e as Error).message}`);
  }
  const result = safeParseProject(data);
  if (!result.ok) {
    fail(`${PROJECT_FILE} failed validation:\n  - ${result.issues.join("\n  - ")}`);
  }
  return result.project;
}

/** Write a project back to disk, normalized (defaults filled) and pretty-printed. */
export function saveProject(root: string, project: Project): void {
  writeFileSync(projectFilePath(root), JSON.stringify(project, null, 2) + "\n", "utf8");
}
