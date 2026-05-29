import { Project } from "./project";

export * from "./primitives";
export * from "./slide";
export * from "./scene";
export * from "./project";
export * from "./timing";

/** Parse and validate unknown data as a Project. Throws ZodError on failure. */
export function parseProject(data: unknown): Project {
  return Project.parse(data);
}

/**
 * Non-throwing validation. Returns either the parsed project or a flat list of
 * human-readable "path: message" issues suitable for CLI output.
 */
export function safeParseProject(
  data: unknown,
): { ok: true; project: Project } | { ok: false; issues: string[] } {
  const result = Project.safeParse(data);
  if (result.success) return { ok: true, project: result.data };
  const issues = result.error.issues.map((i) => {
    const path = i.path.length ? i.path.join(".") : "<root>";
    return `${path}: ${i.message}`;
  });
  return { ok: false, issues };
}

/** Parse a project from a JSON string. Throws on bad JSON or invalid schema. */
export function parseProjectJson(json: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(`project.json is not valid JSON: ${(e as Error).message}`);
  }
  return parseProject(data);
}
