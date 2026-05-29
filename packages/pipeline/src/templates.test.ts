import { describe, expect, test } from "bun:test";
import { Fonts, Palette, parseProject } from "@loom/spec";
import { getTemplate, TEMPLATE_KEYS, TEMPLATES } from "./templates";

describe("templates", () => {
  test("getTemplate returns the matching preset", () => {
    const t = getTemplate("pitch");
    expect(t.key).toBe("pitch");
    expect(t.style.palette.accent).toBe("#f59e0b");
  });

  test("an unknown key throws with the available list", () => {
    expect(() => getTemplate("nope")).toThrow(/unknown template "nope"/);
    expect(() => getTemplate("nope")).toThrow(/explainer/);
  });

  test("every template has a valid palette, fonts, guidance and layouts", () => {
    for (const key of TEMPLATE_KEYS) {
      const t = TEMPLATES[key];
      expect(Palette.safeParse(t.style.palette).success).toBe(true);
      expect(Fonts.safeParse(t.style.fonts).success).toBe(true);
      expect(t.guidance.length).toBeGreaterThan(0);
      expect(t.layouts.length).toBeGreaterThan(0);
    }
  });

  test("a template's style preset is accepted by the project schema", () => {
    const t = getTemplate("news");
    const project = parseProject({
      id: "demo",
      style: { palette: t.style.palette, fonts: t.style.fonts },
      scenes: [],
    });
    expect(project.style.palette.accent).toBe("#e5484d");
    expect(project.style.fonts.display).toBe("Georgia");
  });
});
