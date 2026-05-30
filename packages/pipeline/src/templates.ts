import type { Fonts, Palette } from "@loom/spec";
import { PipelineError } from "./errors";

/**
 * Templates bundle the three things that give a video a consistent character:
 * a **style preset** (palette + fonts), **plan guidance** (extra steering for the
 * planning stage), and a **layout palette** (which slide layouts to favour). They
 * are pure data — `init` applies the style preset, and `plan` folds the guidance
 * and layout palette into the planner. Picking a template never locks anything:
 * every value it sets can still be edited in project.json afterward.
 */
export type TemplateKey = "explainer" | "lesson" | "tutorial" | "pitch" | "news" | "product-demo";

export type Template = {
  key: TemplateKey;
  label: string;
  description: string;
  /** Style preset applied to the project's palette + fonts. */
  style: { palette: Palette; fonts: Fonts };
  /** Lines appended to the plan stage's system prompt. */
  guidance: string[];
  /** Slide layouts this template favours, surfaced to the planner. */
  layouts: Array<"title" | "image" | "imageText" | "bullets" | "quote" | "code" | "chart">;
  /** Human-readable scene-count hint used when the user doesn't force one. */
  scenes: string;
};

export const TEMPLATES: Record<TemplateKey, Template> = {
  explainer: {
    key: "explainer",
    label: "Explainer",
    description: "Tight, well-paced concept explainer. The default Loom feel.",
    style: {
      palette: { bg: "#0b1020", fg: "#f5f7ff", accent: "#7c6cff" },
      fonts: { display: "Inter", body: "Inter" },
    },
    guidance: [
      "This is an EXPLAINER: make one idea click at a time, building to a clear takeaway.",
      "Open and close with a 'title' slide. Keep momentum — no scene should feel like filler.",
    ],
    layouts: ["title", "imageText", "image"],
    scenes: "4-7",
  },
  lesson: {
    key: "lesson",
    label: "Lesson",
    description: "A friendly mini-lesson that teaches one concept clearly, like a great teacher.",
    style: {
      palette: { bg: "#0e1726", fg: "#f4f7fb", accent: "#f6a823" },
      fonts: { display: "Inter", body: "Inter" },
    },
    guidance: [
      "This is a LESSON: teach ONE concept the way a great teacher would — curious, warm, and clear.",
      "Open on a concrete hook: an everyday observation, a question, or a surprising fact. Never open with a textbook definition.",
      "Teach one idea per scene, in a logical build. Give each abstract idea a single vivid, everyday analogy — don't stack metaphors.",
      "Prefer plain language over jargon; if a technical term is unavoidable, define it in passing in the same breath.",
      "Close by paying off the opening hook — the satisfying 'so THAT'S why' moment — not a generic summary.",
    ],
    layouts: ["title", "imageText", "image"],
    scenes: "5-7",
  },
  tutorial: {
    key: "tutorial",
    label: "Tutorial",
    description: "Step-by-step how-to. Each scene is one actionable step.",
    style: {
      palette: { bg: "#0d1117", fg: "#e6edf3", accent: "#2dd4bf" },
      fonts: { display: "Inter", body: "Inter" },
    },
    guidance: [
      "This is a TUTORIAL: each scene is ONE concrete step, in order. Use imperative voice ('Open…', 'Run…', 'Click…').",
      "Lead each step with a short heading via 'imageText' so the viewer can follow along. End with a quick recap.",
      "For anything involving commands or code, use a 'code' slide and spotlight the lines that matter. Use 'bullets' for a recap.",
    ],
    layouts: ["title", "imageText", "code", "bullets"],
    scenes: "5-8",
  },
  pitch: {
    key: "pitch",
    label: "Pitch",
    description: "Punchy investor/product pitch: problem → solution → ask.",
    style: {
      palette: { bg: "#0a0a0a", fg: "#fafafa", accent: "#f59e0b" },
      fonts: { display: "Inter", body: "Inter" },
    },
    guidance: [
      "This is a PITCH: structure it problem → solution → why-now → the ask. Be confident and concrete, never hypey.",
      "Keep sentences short and punchy. Lean on bold 'title' beats for the hook and the close.",
      "Use 'bullets' for the few reasons that matter and 'chart' when you have real traction/market numbers from the prompt.",
    ],
    layouts: ["title", "imageText", "image", "bullets", "chart"],
    scenes: "4-6",
  },
  news: {
    key: "news",
    label: "News",
    description: "Authoritative news segment: lead with the headline, stay neutral.",
    style: {
      palette: { bg: "#11151c", fg: "#f2f4f7", accent: "#e5484d" },
      fonts: { display: "Georgia", body: "Georgia" },
    },
    guidance: [
      "This is a NEWS segment: inverted pyramid — lead with the most important fact, then context, then detail.",
      "Neutral, authoritative tone. Open with a 'title' headline; prefer 'imageText' for on-screen context.",
    ],
    layouts: ["title", "imageText", "image"],
    scenes: "4-6",
  },
  "product-demo": {
    key: "product-demo",
    label: "Product demo",
    description: "Sleek product walkthrough: show the product, feature → benefit.",
    style: {
      palette: { bg: "#0b1220", fg: "#eef2ff", accent: "#3b82f6" },
      fonts: { display: "Inter", body: "Inter" },
    },
    guidance: [
      "This is a PRODUCT DEMO: for each feature, show it then state the benefit it unlocks for the user.",
      "Keep the product front-and-centre — favour full-bleed 'image' beats, with 'imageText' to name the feature.",
    ],
    layouts: ["title", "image", "imageText"],
    scenes: "4-7",
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

/** Look up a template by key, throwing a helpful error for an unknown one. */
export function getTemplate(key: string): Template {
  const t = (TEMPLATES as Record<string, Template>)[key];
  if (!t) {
    throw new PipelineError(`unknown template "${key}". Available: ${TEMPLATE_KEYS.join(", ")}.`);
  }
  return t;
}
