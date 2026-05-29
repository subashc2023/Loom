import { z } from "zod";
import { KNOWN_BEAT_TAGS, parseProject, type Project } from "@loom/spec";
import { callClaudeTool, type ClaudeTool } from "./anthropic";
import { estimateNarrationMs } from "./audio";
import { PipelineError } from "./errors";

/**
 * `script` is the narration-polish pass: it rewrites each scene's `script` for the
 * ear (rhythm, contractions, no visual stage directions) and emits timing beats
 * used downstream for emphasis and slide changes. Slide content is left untouched.
 * It operates per scene, preserving order and count.
 */

const ScriptBeat = z.object({
  // Fraction (0..1) through the narration where the beat lands; converted to ms
  // against the duration estimate so beats survive before audio exists.
  at: z.number().min(0).max(1),
  tag: z.string().min(1),
});

const ScriptOutput = z.object({
  scenes: z.array(z.object({ script: z.string().min(1), beats: z.array(ScriptBeat).optional() })),
});
type ScriptOutput = z.infer<typeof ScriptOutput>;

const SCRIPT_TOOL: ClaudeTool = {
  name: "emit_script",
  description: "Emit the polished narration and timing beats, one entry per scene, in the same order.",
  input_schema: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        description: "One entry per input scene, SAME COUNT and SAME ORDER.",
        items: {
          type: "object",
          properties: {
            script: { type: "string", description: "Polished spoken narration for this scene." },
            beats: {
              type: "array",
              description: "Optional timing markers within this scene's narration.",
              items: {
                type: "object",
                properties: {
                  at: { type: "number", description: "Position within the narration, 0 (start) to 1 (end)." },
                  tag: {
                    type: "string",
                    description: `What happens here. Prefer one of: ${KNOWN_BEAT_TAGS.join(", ")}.`,
                  },
                },
                required: ["at", "tag"],
              },
            },
          },
          required: ["script"],
        },
      },
    },
    required: ["scenes"],
  },
};

const SYSTEM = [
  "You are the script stage of an AI video pipeline. You polish existing scene narration so it sounds great spoken aloud.",
  "",
  "For each scene, in order:",
  "- Rewrite the narration to be natural, rhythmic, and concise. Use contractions. Read for the ear.",
  "- Vary sentence length deliberately — a short punchy line after a longer one creates rhythm. Lead with the most concrete, vivid words.",
  "- Cut filler and throat-clearing ('basically', 'essentially', 'it's important to note', 'as we know'). Every word should pull weight.",
  "- Keep jargon out unless it's the point; if a term must stay, make its meaning obvious from the sentence around it.",
  "- Keep the meaning and the scene's intent. Do not merge, split, reorder, add, or drop scenes.",
  "- Remove any stage directions or references to the visuals ('as you can see', 'this image').",
  "- Optionally add a few beats: 'emphasis' on a key phrase, 'punchline' at a reveal, 'pause' for a beat of silence.",
  "",
  "Return exactly one entry per input scene by calling the emit_script tool.",
].join("\n");

export type ScriptOptions = { model?: string };

/** Polish every scene's narration in place and attach beats. */
export async function writeScript(project: Project, opts: ScriptOptions = {}): Promise<Project> {
  if (project.scenes.length === 0) {
    throw new PipelineError("no scenes to script — run `loom plan` first.");
  }

  const user = JSON.stringify(
    {
      title: project.meta.title,
      scenes: project.scenes.map((s, i) => ({ scene: i + 1, narration: s.script })),
    },
    null,
    2,
  );

  const out = await callClaudeTool({ system: SYSTEM, user, tool: SCRIPT_TOOL, schema: ScriptOutput, model: opts.model });

  if (out.scenes.length !== project.scenes.length) {
    throw new PipelineError(
      `script stage returned ${out.scenes.length} scenes but the project has ${project.scenes.length}. Aborting to avoid misaligning narration.`,
    );
  }

  return applyScript(project, out);
}

function applyScript(project: Project, out: ScriptOutput): Project {
  const scenes = project.scenes.map((scene, i) => {
    const result = out.scenes[i]!;
    // Without audio yet, size slides from the new estimate so the draft stays
    // correct; once voiced, `voice` owns the real durations.
    const durationMs = estimateNarrationMs(result.script);
    const slides = scene.audio
      ? scene.slides
      : scene.slides.map((sl) => (sl.startMs === 0 ? { ...sl, durationMs } : sl));
    const beats = (result.beats ?? []).map((b) => ({ tMs: Math.round(b.at * durationMs), tag: b.tag }));
    return { ...scene, script: result.script, beats, slides };
  });
  return parseProject({ ...project, scenes });
}
