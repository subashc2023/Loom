import { z } from "zod";
import { HexColor, parseProject, type Project } from "@loom/spec";
import { generateStructured } from "./llm";
import { estimateNarrationMs, fitSlidesToDuration } from "./audio";
import { sceneId, slideId } from "./ids";
import type { Template } from "./templates";

/**
 * `plan` turns a one-line prompt into a structured multi-scene spec: narration
 * plus a slide brief per scene. It writes briefs (image *prompts*), not images —
 * `slides` generates those later. Slides are sized from a narration estimate so
 * the project renders immediately, before `voice` measures real durations.
 */

// The plan the model must emit. This Zod schema is the single source of truth:
// the AI SDK derives the provider's JSON Schema from it (descriptions included)
// and validates the response against it, so a malformed plan fails loudly here
// instead of corrupting specs.
const IMAGE_PROMPT = z
  .string()
  .min(1)
  .describe(
    "image/imageText layout: a vivid, concrete image-generation prompt (subject, setting, style, lighting). No text in the image.",
  );
const SEARCH_QUERY = z
  .string()
  .optional()
  .describe(
    "image/imageText layout: 2-5 plain keywords to find a REAL photo/diagram of this subject in a public image library (name the subject, not the art style). Omit only for purely abstract/decorative visuals.",
  );

const PlanSlide = z
  .discriminatedUnion("layout", [
    z.object({
      layout: z.literal("title"),
      title: z.string().min(1).describe("title layout: the on-screen headline."),
      subtitle: z.string().optional().describe("title layout: optional subtitle."),
    }),
    z.object({
      layout: z.literal("image"),
      imagePrompt: IMAGE_PROMPT,
      searchQuery: SEARCH_QUERY,
      alt: z.string().optional().describe("image layout: optional alt text."),
    }),
    z.object({
      layout: z.literal("imageText"),
      imagePrompt: IMAGE_PROMPT,
      searchQuery: SEARCH_QUERY,
      heading: z.string().optional().describe("imageText layout: short heading shown over the image."),
      body: z.string().min(1).describe("imageText layout: a 1-2 sentence on-screen caption."),
      position: z
        .enum(["left", "right", "top", "bottom"])
        .optional()
        .describe("imageText layout: where the text sits relative to the image."),
    }),
    z.object({
      layout: z.literal("bullets"),
      heading: z.string().optional().describe("bullets layout: optional title above the list."),
      items: z
        .array(z.string().min(1))
        .min(2)
        .max(6)
        .describe("bullets layout: 2-6 short, parallel points (a few words each, not sentences)."),
    }),
    z.object({
      layout: z.literal("quote"),
      quote: z.string().min(1).describe("quote layout: a single punchy line to pull out and enlarge."),
      attribution: z
        .string()
        .optional()
        .describe(
          "quote layout: who said it. Only attribute a quote you are confident is REAL; leave empty for an unattributed line. Never invent an attributed quote.",
        ),
    }),
    z.object({
      layout: z.literal("code"),
      code: z.string().min(1).describe("code layout: a short, correct code snippet (≤ ~14 lines)."),
      language: z.string().optional().describe("code layout: language hint, e.g. 'ts', 'py', 'json', or 'diff'."),
      codeTitle: z.string().optional().describe("code layout: optional filename/caption for the editor title bar."),
      highlightLines: z
        .array(z.number().int().min(1))
        .optional()
        .describe("code layout: 1-based line numbers to spotlight; the rest dim."),
    }),
    z.object({
      layout: z.literal("chart"),
      chartType: z.enum(["bar", "line", "area", "pie"]).describe("chart layout: which chart to draw."),
      chartTitle: z.string().optional().describe("chart layout: optional title above the chart."),
      categoryLabel: z
        .string()
        .optional()
        .describe("chart layout: name of the category axis, e.g. 'Year', 'Stage'. Defaults to 'Label'."),
      points: z
        .array(
          z.object({
            label: z.string().min(1).describe("category for this data point, e.g. '2021' or 'Mobile'."),
            value: z.number().describe("numeric value for this point."),
          }),
        )
        .min(2)
        .max(8)
        .describe("chart layout: 2-8 data points. Use only data given in the prompt or genuinely common knowledge — never invent precise statistics."),
    }),
  ])
  .describe(
    "One visual. 'title' for opener/closer, 'image' for a full-bleed visual, 'imageText' for an image with a caption, 'bullets' for a few parallel points, 'quote' for a pulled-out line, 'code' for a snippet, 'chart' for simple data.",
  );

const PlanScene = z.object({
  script: z
    .string()
    .min(1)
    .describe("Narration for this scene: 1-3 spoken sentences. Conversational, no visual stage directions."),
  slides: z
    .array(PlanSlide)
    .min(1)
    .max(3)
    .describe(
      "1-3 visuals for this scene, in the order they appear. Use one for a single beat; use 2-3 only when the narration has distinct visual moments (a cut on a key word). `cut` later snaps the changes onto emphasis beats.",
    ),
});

const PlanOutput = z.object({
  title: z.string().min(1).describe("Short, punchy video title."),
  accentColor: z
    .string()
    .optional()
    .describe("Optional accent color as a hex string like #6366f1, chosen to fit the topic's mood."),
  scenes: z
    .array(PlanScene)
    .min(1)
    .describe("Ordered scenes. Each is ~1 paragraph of narration with 1-3 slides."),
});
export type PlanOutput = z.infer<typeof PlanOutput>;
type PlanSlideT = z.infer<typeof PlanSlide>;

function systemPrompt(sceneCount?: number, template?: Template, aspectRatio?: string): string {
  const sceneRule = sceneCount
    ? `- Produce exactly ${sceneCount} scenes.`
    : template
      ? `- Produce ${template.scenes} scenes unless the prompt clearly calls for more or fewer.`
      : "- Produce 4-7 scenes unless the prompt clearly calls for more or fewer.";

  // Layout/copy advice that depends on the output shape. A tall mobile frame
  // can't carry a side-by-side split or long headings.
  const orientationRule =
    aspectRatio === "9:16"
      ? "- This is a VERTICAL (9:16) mobile video. Keep headings to ≤4 words and on-screen body to ONE short sentence. For imageText use position 'top' or 'bottom' (never 'left'/'right'). Favour full-bleed 'image' beats."
      : aspectRatio === "1:1"
        ? "- This is a SQUARE (1:1) video. Keep headings short and prefer 'top'/'bottom' imageText over left/right splits."
        : null;

  return [
    "You are the planning stage of an AI video pipeline that produces short, professional explainer videos.",
    "Given a prompt, design a tight, well-paced video as an ordered list of scenes.",
    "",
    "Rules:",
    "- Open with a 'title' slide and, when it helps, close with one.",
    "- Each scene is ONE idea: 1-3 sentences of spoken narration. Write for the ear, not the page.",
    "- Narration must contain no stage directions or references to 'this image' — it is voiced over the visuals.",
    "",
    "Pick the layout that fits the beat (don't make everything an image):",
    "- 'image' — a pure visual beat; 'imageText' — an image that needs a short on-screen caption.",
    "- 'bullets' — a few parallel points (a list, steps, trade-offs). Keep items to a few words.",
    "- 'quote' — one punchy line worth enlarging. Only attribute REAL quotes; otherwise leave attribution empty.",
    "- 'code' — a short, correct snippet for technical topics (set `language`; spotlight key lines with `highlightLines`).",
    "- 'chart' — simple data with 2-8 points. Use ONLY data from the prompt or genuine common knowledge; never fabricate statistics.",
    "- Most scenes have ONE slide. Give a scene 2-3 slides only when its narration has distinct visual moments — a cut should land on a key word, not chop a sentence.",
    "",
    "Write like the best explainer you've ever watched, not a Wikipedia intro:",
    "- LEAD WITH A HOOK: a concrete image, a question, or a surprising detail — never a dictionary definition.",
    "- Be concrete and specific. Prefer real nouns and numbers over abstractions and hedges ('basically', 'essentially', 'a variety of').",
    "- At most one fresh analogy per idea, and only when it genuinely clarifies. Avoid clichés ('imagine a world', 'in today's world', 'simply put').",
    "- Vary sentence length for rhythm. Every sentence must earn its place — cut throat-clearing and filler.",
    "- Build to a takeaway that pays off the opening, so the ending feels earned rather than tacked on.",
    "",
    "For each image/imageText slide, also provide:",
    "- imagePrompt: a vivid, concrete brief for an AI image generator (subject, setting, style, lighting). Never put words/text in an image.",
    "- searchQuery: 2-5 plain keywords to find a REAL photo/diagram of this in a public library (e.g. 'Rayleigh scattering diagram', 'sunset over ocean horizon'). Name the actual subject, not the art style. Omit only if the shot is purely abstract/decorative.",
    sceneRule,
    ...(orientationRule ? [orientationRule] : []),
    ...(template
      ? ["", `Template: ${template.label}.`, ...template.guidance, `Favour these layouts: ${template.layouts.join(", ")}.`]
      : []),
    "",
    "Emit the plan by calling the emit_video_plan tool.",
  ].join("\n");
}

export type PlanOptions = {
  /** The existing project to extend; its id/meta/style/music are preserved. */
  base: Project;
  model?: string;
  /** Force an exact scene count. */
  scenes?: number;
  /** Steer the plan and apply a style preset + layout palette. */
  template?: Template;
};

/** Generate a fresh set of scenes for `base` from a natural-language prompt. */
export async function planVideo(prompt: string, opts: PlanOptions): Promise<Project> {
  const plan = await generateStructured({
    system: systemPrompt(opts.scenes, opts.template, opts.base.meta.aspectRatio),
    user: prompt,
    schema: PlanOutput,
    schemaName: "video_plan",
    schemaDescription: "The structured plan for the video: a title and an ordered list of scenes.",
    model: opts.model,
  });
  return applyPlan(opts.base, plan, opts.template);
}

/** Map a validated plan onto the base project, then re-validate the whole spec. */
export function applyPlan(base: Project, plan: PlanOutput, template?: Template): Project {
  const scenes = plan.scenes.map((s, i) => {
    const sid = sceneId(i);
    const durationMs = estimateNarrationMs(s.script);
    // Build each slide, then tile them across the narration estimate so a
    // multi-slide scene renders gap-free before `voice`/`cut` refine the timing.
    const built = s.slides.map((sl, j) => ({ ...slideContent(sl), id: slideId(sid, j), startMs: 0, durationMs: 0 }));
    return {
      id: sid,
      script: s.script,
      slides: fitSlidesToDuration(built, durationMs),
      transition: { type: "fade" as const, durationMs: 300 },
    };
  });

  // A template owns the palette + fonts (that's the point of a preset); without
  // one, keep the base style and let the planner's accent suggestion through.
  const style = template
    ? { ...base.style, palette: template.style.palette, fonts: template.style.fonts }
    : {
        ...base.style,
        palette: {
          ...base.style.palette,
          accent:
            plan.accentColor && HexColor.safeParse(plan.accentColor).success
              ? plan.accentColor
              : base.style.palette.accent,
        },
      };

  return parseProject({
    ...base,
    meta: { ...base.meta, title: plan.title },
    style,
    scenes,
  });
}

/** Translate a plan slide into spec slide content (briefs carry `prompt`, not `src`). */
function slideContent(slide: PlanSlideT) {
  switch (slide.layout) {
    case "title":
      return { layout: "title" as const, content: { title: slide.title, subtitle: slide.subtitle } };
    case "image":
      return { layout: "image" as const, content: { prompt: slide.imagePrompt, query: slide.searchQuery, alt: slide.alt } };
    case "imageText":
      return {
        layout: "imageText" as const,
        content: {
          prompt: slide.imagePrompt,
          query: slide.searchQuery,
          heading: slide.heading,
          body: slide.body,
          position: slide.position ?? "bottom",
        },
      };
    case "bullets":
      return { layout: "bullets" as const, content: { title: slide.heading, items: slide.items } };
    case "quote":
      return { layout: "quote" as const, content: { text: slide.quote, attribution: slide.attribution } };
    case "code":
      return {
        layout: "code" as const,
        content: {
          code: slide.code,
          language: slide.language,
          title: slide.codeTitle,
          highlight: slide.highlightLines,
        },
      };
    case "chart": {
      const category = slide.categoryLabel?.trim() || "Label";
      return {
        layout: "chart" as const,
        content: {
          chartType: slide.chartType,
          title: slide.chartTitle,
          xKey: category,
          yKeys: ["value"],
          data: slide.points.map((p) => ({ [category]: p.label, value: p.value })),
        },
      };
    }
  }
}
