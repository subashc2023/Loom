import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./errors";

/**
 * API keys are the user's own (PLAN.md open question #2: "users bring their own
 * keys"). We read them from the environment, optionally seeded from a project- or
 * cwd-local `.env`. Bun auto-loads `.env`, but we load it ourselves too so the
 * behaviour is identical under Node and so a key can live next to the project.
 */
const loadedDirs = new Set<string>();

/** Parse a project's `.env` into process.env without overriding existing vars. */
export function loadEnv(dir: string): void {
  if (loadedDirs.has(dir)) return;
  loadedDirs.add(dir);
  const file = join(dir, ".env");
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

/** A required env var; the first non-empty match wins. */
export function requireKey(names: string[], hint: string): string {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  const list = names.join(" or ");
  throw new PipelineError(
    `missing API key: set ${list} (${hint}). Put it in your environment or a .env file in the project.`,
  );
}
