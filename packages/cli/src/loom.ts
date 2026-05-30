#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { PipelineError } from "@loom/pipeline";
import { init } from "./commands/init";
import { compose } from "./commands/compose";
import { render, type Quality } from "./commands/render";
import { plan } from "./commands/plan";
import { script } from "./commands/script";
import { voice } from "./commands/voice";
import { music } from "./commands/music";
import { record } from "./commands/record";
import { align } from "./commands/align";
import { slides } from "./commands/slides";
import { source } from "./commands/source";
import { cut } from "./commands/cut";
import { manim } from "./commands/manim";
import { templates } from "./commands/templates";
import { log, c, fail } from "./log";

const HELP = `${c.bold("loom")} — talk to Claude Code, get an MP4

${c.bold("Usage:")} loom <command> [options]

${c.bold("Authoring (needs API keys):")}
  plan "<prompt>"    Opus → outline + slide briefs → project.json
  script             Opus → polish narration, add timing beats
  voice              ElevenLabs → narration audio + durations
  align              ElevenLabs → word-level caption timing
  source             Commons + Openverse → real images for slide briefs (no key)
  slides             Gemini → images for slide briefs (fills the gaps)

${c.bold("Edit (no API key):")}
  cut                snap slide changes to emphasis/punchline beats
  manim              render manim slides to clips (needs the manim binary)

${c.bold("Your own voice (no API key):")}
  record             record a scene from your mic (playback + keep/redo)
  voice --import <f> use a file you recorded elsewhere as a scene's narration

${c.bold("Music (no API key):")}
  music --import <f> add a background-music bed (loops + ducks under narration)
                     tune with --volume/--duck; remove with --clear

${c.bold("Build:")}
  init <name>        scaffold a new project (--template <key> --aspect <ratio>)
  templates          list the available project templates
  compose            validate the spec, check assets, print the timeline
  render             render the spec to an MP4
  help               show this help

${c.bold("Options:")}
  -p, --project <dir>      project dir or a name under projects/ (default: cwd)
  -q, --quality <q>        render quality: draft | final (default: draft)
  -o, --out <path>         render output file (default: output/<quality>.mp4)
      --no-captions        render: drop burned-in captions (--captions forces them on)
      --strict             compose: fail (not warn) on missing assets
      --model <id>         plan/script: LLM as provider:model (e.g. openai:gpt-4o,
                           anthropic:claude-opus-4-8); slides: the Gemini image model
      --template <key>     init/plan: style preset + plan steering (see: loom templates)
      --aspect <ratio>     init: output shape — 16:9 (default) | 9:16 mobile | 1:1 square
      --scenes <n>         plan: force an exact scene count
      --scene <id>         voice/align/slides/record/cut/manim: limit to one scene
      --slide <id>         slides/manim: limit to one slide
      --voice-id <id>      voice: ElevenLabs voice id
      --import <file>      voice: use this audio file instead of TTS (needs --scene)
      --device <name>      record: mic device (default: first input found)
      --volume <0..1>      music: base level in narration-free gaps (default 0.3)
      --duck <0..1>        music: level while narration plays (default 0.1)
      --clear              music: remove the music bed
      --variations <n>     slides: generate n candidates for --slide and pick one
      --set-reference <r>  slides: set the style lock to a slide id or image file
      --query <terms>      source: override a slide's search keywords
      --pick <n>           source: adopt candidate n for --slide
      --auto               source: auto-adopt the top candidate for each brief
      --limit <n>          source: candidates to fetch per slide (default 6)
      --reroll             voice/align/slides/source: regenerate even if it exists
  -h, --help               show help

${c.bold("Keys")} (env or a .env in the project):
  ANTHROPIC_API_KEY / OPENAI_API_KEY (plan/script) · ELEVENLABS_API_KEY · GEMINI_API_KEY

${c.bold("Typical flow:")}
  loom init talk && cd projects/talk
  loom plan "a 90s explainer on how DNS works"
  loom script && loom voice && loom align && loom slides
  loom compose && loom render --quality final
`;

// Stages named in PLAN.md that aren't built yet. Looked up so an unimplemented
// command explains itself instead of reading as a typo. Empty now that align
// ships — future Phase 2/3 stages (e.g. `preview`) can be listed here.
const PLANNED: Record<string, string> = {};

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    log.info(HELP);
    return;
  }

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      quality: { type: "string", short: "q" },
      out: { type: "string", short: "o" },
      strict: { type: "boolean" },
      model: { type: "string" },
      template: { type: "string" },
      aspect: { type: "string" },
      scenes: { type: "string" },
      scene: { type: "string" },
      slide: { type: "string" },
      "voice-id": { type: "string" },
      import: { type: "string" },
      device: { type: "string" },
      volume: { type: "string" },
      duck: { type: "string" },
      clear: { type: "boolean" },
      variations: { type: "string" },
      "set-reference": { type: "string" },
      query: { type: "string" },
      pick: { type: "string" },
      auto: { type: "boolean" },
      limit: { type: "string" },
      reroll: { type: "boolean" },
      captions: { type: "boolean" },
      "no-captions": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  switch (command) {
    case "init":
      init(positionals, { template: values.template, aspect: values.aspect });
      return;
    case "templates":
      templates();
      return;
    case "plan":
      await plan(positionals, {
        project: values.project,
        model: values.model,
        scenes: parseScenes(values.scenes),
        template: values.template,
      });
      return;
    case "script":
      await script({ project: values.project, model: values.model });
      return;
    case "voice":
      await voice({
        project: values.project,
        scene: values.scene,
        reroll: values.reroll,
        voiceId: values["voice-id"],
        model: values.model,
        importFile: values.import,
      });
      return;
    case "record":
      await record({ project: values.project, scene: values.scene, device: values.device });
      return;
    case "music":
      music({
        project: values.project,
        importFile: values.import,
        volume: parseLevel(values.volume, "--volume"),
        duckTo: parseLevel(values.duck, "--duck"),
        clear: values.clear,
      });
      return;
    case "align":
      await align({ project: values.project, scene: values.scene, reroll: values.reroll });
      return;
    case "slides":
      await slides({
        project: values.project,
        scene: values.scene,
        slide: values.slide,
        reroll: values.reroll,
        model: values.model,
        variations: parseVariations(values.variations),
        setReference: values["set-reference"],
      });
      return;
    case "source":
      await source({
        project: values.project,
        scene: values.scene,
        slide: values.slide,
        query: values.query,
        pick: parsePick(values.pick),
        auto: values.auto,
        limit: parseLimit(values.limit),
        reroll: values.reroll,
      });
      return;
    case "cut":
      cut({ project: values.project, scene: values.scene });
      return;
    case "manim":
      manim({ project: values.project, scene: values.scene, slide: values.slide, reroll: values.reroll });
      return;
    case "compose":
      compose({ project: values.project, strict: values.strict });
      return;
    case "render": {
      const quality = (values.quality ?? "draft") as Quality;
      if (quality !== "draft" && quality !== "final") fail(`unknown quality "${quality}" (use draft|final)`);
      await render({ project: values.project, quality, out: values.out, captions: resolveCaptions(values) });
      return;
    }
    default:
      if (PLANNED[command]) {
        fail(`\`loom ${command}\` is not implemented yet: ${PLANNED[command]}.`);
      }
      fail(`unknown command "${command}". Run \`loom help\`.`);
  }
}

function parseScenes(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1) fail(`--scenes must be a positive integer, got "${v}"`);
  return n;
}

function parseVariations(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 2 || n > 6) fail(`--variations must be an integer 2-6, got "${v}"`);
  return n;
}

function parsePick(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1) fail(`--pick must be a positive integer, got "${v}"`);
  return n;
}

// `--no-captions` / `--captions` → an explicit override, or undefined to keep
// the spec's setting. Passing both at once is a contradiction, so reject it.
function resolveCaptions(values: { captions?: boolean; "no-captions"?: boolean }): boolean | undefined {
  if (values.captions && values["no-captions"]) fail("pass either --captions or --no-captions, not both");
  if (values["no-captions"]) return false;
  if (values.captions) return true;
  return undefined;
}

function parseLimit(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1 || n > 20) fail(`--limit must be an integer 1-20, got "${v}"`);
  return n;
}

// A 0..1 audio level (music volume/duck). Rejects out-of-range so the failure is
// a clean CLI message rather than a Zod error deep in the spec.
function parseLevel(v: string | undefined, flag: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) fail(`${flag} must be a number 0..1, got "${v}"`);
  return n;
}

main().catch((e) => {
  // Expected, user-facing failures print cleanly; bugs surface their stack.
  if (e instanceof PipelineError) fail(e.message);
  if (e instanceof Error) fail(e.stack ?? e.message);
  fail(String(e));
});
