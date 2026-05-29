import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parseProject } from "@loom/spec";
import { getTemplate } from "@loom/pipeline";
import { log, fail, c } from "../log";
import { PROJECT_FILE, PROJECTS_DIR, saveProject } from "../project-io";

/**
 * Output formats a user can pick at init. Each maps to an aspect ratio + a
 * sensible 1080p-class resolution. Friendly aliases ("mobile", "vertical") map
 * onto the canonical ratios.
 */
const FORMATS: Record<string, { aspectRatio: "16:9" | "9:16" | "1:1"; resolution: [number, number]; label: string }> = {
  "16:9": { aspectRatio: "16:9", resolution: [1920, 1080], label: "Landscape 16:9 (1920×1080)" },
  landscape: { aspectRatio: "16:9", resolution: [1920, 1080], label: "Landscape 16:9 (1920×1080)" },
  "9:16": { aspectRatio: "9:16", resolution: [1080, 1920], label: "Vertical 9:16 (1080×1920)" },
  mobile: { aspectRatio: "9:16", resolution: [1080, 1920], label: "Vertical 9:16 (1080×1920)" },
  vertical: { aspectRatio: "9:16", resolution: [1080, 1920], label: "Vertical 9:16 (1080×1920)" },
  portrait: { aspectRatio: "9:16", resolution: [1080, 1920], label: "Vertical 9:16 (1080×1920)" },
  "1:1": { aspectRatio: "1:1", resolution: [1080, 1080], label: "Square 1:1 (1080×1080)" },
  square: { aspectRatio: "1:1", resolution: [1080, 1080], label: "Square 1:1 (1080×1080)" },
};

function resolveFormat(aspect?: string) {
  if (!aspect) return FORMATS["16:9"]!;
  const f = FORMATS[aspect.toLowerCase()];
  if (!f) fail(`unknown --aspect "${aspect}". Use one of: 16:9 | 9:16 | 1:1 (aliases: landscape, mobile, square).`);
  return f!;
}

/**
 * Scaffold a new project directory. The starter spec is a single title scene
 * with no external assets, so `loom render` works immediately with no API keys —
 * the pipeline stages fill in audio, slides, and more scenes later. A --template
 * applies its style preset up front (the planner uses the rest of the template).
 * --aspect picks the output shape (landscape / mobile-vertical / square).
 */
export function init(args: string[], opts: { template?: string; aspect?: string } = {}): void {
  const name = args[0];
  if (!name) fail("usage: loom init <name> [--template <key>] [--aspect 16:9|9:16|1:1]");

  // Projects live under a gitignored projects/ dir so the code repo can be
  // shared without the runs. If init is invoked from inside projects/ already,
  // don't double-nest.
  const base = basename(process.cwd()) === PROJECTS_DIR ? process.cwd() : join(process.cwd(), PROJECTS_DIR);
  const root = join(base, name);
  if (existsSync(join(root, PROJECT_FILE))) {
    fail(`a project already exists at ${root}`);
  }

  const format = resolveFormat(opts.aspect);
  const template = opts.template ? getTemplate(opts.template) : undefined;

  // Standard project layout (see PLAN.md "What a user's project looks like").
  for (const dir of ["assets/audio", "assets/images", "assets/music", "assets/refs", "output"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  const project = parseProject({
    id: slugify(name),
    meta: { title: name, aspectRatio: format.aspectRatio, resolution: format.resolution },
    style: template ? { palette: template.style.palette, fonts: template.style.fonts } : {},
    scenes: [
      {
        id: "s1",
        script: `${name} — your script goes here.`,
        slides: [
          {
            id: "s1-title",
            layout: "title",
            startMs: 0,
            durationMs: 4000,
            content: { title: name, subtitle: "Made with Loom" },
          },
        ],
        transition: { type: "fade", durationMs: 250 },
      },
    ],
  });
  saveProject(root, project);

  writeFileSync(
    join(root, "script.md"),
    `# ${name}\n\nHuman-editable source of truth for narration. Edit this, then re-run the\nvoice/align/render stages.\n\n## Scene 1\n\nYour script goes here.\n`,
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), "output/\n.loom-cache/\n.env\n", "utf8");

  log.ok(`created project ${c.bold(name)} at ${c.dim(root)}`);
  log.info(`  ${c.dim("format:")} ${format.label}`);
  if (template) log.info(`  ${c.dim("template:")} ${template.label} — ${template.description}`);
  log.info("");
  log.step(`cd ${relative(process.cwd(), root) || name}`);
  if (template) {
    log.step(`loom plan "<your topic>" --template ${template.key}   # plan with this template`);
  }
  log.step("loom render        # renders the starter title card to output/draft.mp4");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}
