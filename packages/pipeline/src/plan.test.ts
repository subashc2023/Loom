import { describe, expect, test } from "bun:test";
import { parseProject, type Project, type Slide } from "@loom/spec";
import { applyPlan, type PlanOutput } from "./plan";

const base: Project = parseProject({ id: "demo" });

/** Find the single slide of scene `i`, narrowed to a given layout. */
function slideOf<L extends Slide["layout"]>(project: Project, i: number, layout: L) {
  const slide = project.scenes[i]!.slides[0]!;
  expect(slide.layout).toBe(layout);
  return slide as Extract<Slide, { layout: L }>;
}

describe("applyPlan layout mapping", () => {
  test("maps every plan layout onto a spec-valid project", () => {
    const plan: PlanOutput = {
      title: "Layouts",
      scenes: [
        { script: "one two three", slides: [{ layout: "bullets", heading: "Why", items: ["fast", "cheap"] }] },
        { script: "one two three", slides: [{ layout: "quote", quote: "Stay hungry", attribution: "Jobs" }] },
        {
          script: "one two three",
          slides: [{ layout: "code", code: "const x = 1", language: "ts", codeTitle: "x.ts", highlightLines: [1] }],
        },
        {
          script: "one two three",
          slides: [
            {
              layout: "chart",
              chartType: "bar",
              chartTitle: "Growth",
              categoryLabel: "Year",
              points: [
                { label: "2020", value: 10 },
                { label: "2021", value: 25 },
              ],
            },
          ],
        },
      ],
    };

    // applyPlan re-validates via parseProject, so a bad mapping would throw here.
    const project = applyPlan(base, plan);
    expect(project.scenes).toHaveLength(4);

    const bullets = slideOf(project, 0, "bullets");
    expect(bullets.content).toMatchObject({ title: "Why", items: ["fast", "cheap"] });

    const quote = slideOf(project, 1, "quote");
    expect(quote.content).toMatchObject({ text: "Stay hungry", attribution: "Jobs" });

    const code = slideOf(project, 2, "code");
    expect(code.content).toMatchObject({ code: "const x = 1", language: "ts", title: "x.ts", highlight: [1] });

    const chart = slideOf(project, 3, "chart");
    expect(chart.content.chartType).toBe("bar");
    expect(chart.content.xKey).toBe("Year");
    expect(chart.content.yKeys).toEqual(["value"]);
    expect(chart.content.data).toEqual([
      { Year: "2020", value: 10 },
      { Year: "2021", value: 25 },
    ]);
  });

  test("chart categoryLabel defaults to 'Label' when omitted", () => {
    const plan: PlanOutput = {
      title: "T",
      scenes: [
        {
          script: "hi",
          slides: [{ layout: "chart", chartType: "pie", points: [{ label: "A", value: 1 }, { label: "B", value: 2 }] }],
        },
      ],
    };
    const chart = slideOf(applyPlan(base, plan), 0, "chart");
    expect(chart.content.xKey).toBe("Label");
    expect(chart.content.data[0]).toEqual({ Label: "A", value: 1 });
  });
});

describe("applyPlan multi-slide tiling", () => {
  test("tiles multiple slides contiguously across the scene with nested ids", () => {
    const plan: PlanOutput = {
      title: "Multi",
      scenes: [
        {
          script: "a fairly long narration line so the scene has real duration to tile across",
          slides: [
            { layout: "title", title: "A" },
            { layout: "title", title: "B" },
            { layout: "title", title: "C" },
          ],
        },
      ],
    };
    const slides = applyPlan(base, plan).scenes[0]!.slides;
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => s.id)).toEqual(["s1-1", "s1-2", "s1-3"]);

    // Contiguous, strictly increasing, no gaps or overlaps.
    expect(slides[0]!.startMs).toBe(0);
    for (let i = 0; i < slides.length - 1; i++) {
      expect(slides[i + 1]!.startMs).toBe(slides[i]!.startMs + slides[i]!.durationMs);
      expect(slides[i]!.durationMs).toBeGreaterThan(0);
    }
  });
});
