import { describe, expect, test } from "bun:test";
import { assessmentOf, isFreeLicense, qualityScore } from "./commons";

describe("isFreeLicense", () => {
  test("accepts public domain, CC0, and CC-BY / CC-BY-SA", () => {
    expect(isFreeLicense("pd", "Public domain")).toBe(true);
    expect(isFreeLicense("cc0", "CC0")).toBe(true);
    expect(isFreeLicense("cc-by-4.0", "CC BY 4.0")).toBe(true);
    expect(isFreeLicense("cc-by-sa-3.0", "CC BY-SA 3.0")).toBe(true);
  });

  test("rejects NonCommercial and NoDerivatives — we crop and overlay", () => {
    expect(isFreeLicense("cc-by-nc-4.0", "CC BY-NC 4.0")).toBe(false);
    expect(isFreeLicense("cc-by-nd-4.0", "CC BY-ND 4.0")).toBe(false);
    expect(isFreeLicense("cc-by-nc-sa-3.0", "CC BY-NC-SA 3.0")).toBe(false);
  });

  test("rejects unknown/unverifiable licences rather than guessing", () => {
    expect(isFreeLicense(null, null)).toBe(false);
    expect(isFreeLicense(null, "Fair use")).toBe(false);
    expect(isFreeLicense("", "All rights reserved")).toBe(false);
  });

  test("falls back to the short name when no machine code is present", () => {
    expect(isFreeLicense(null, "Public domain")).toBe(true);
    expect(isFreeLicense(null, "CC BY 2.0")).toBe(true);
  });
});

describe("assessmentOf", () => {
  const cat = (name: string) => ({ title: name });

  test("detects each assessment tier from categories", () => {
    expect(assessmentOf([cat("Category:Featured pictures on Wikimedia Commons")])).toBe("featured");
    expect(assessmentOf([cat("Category:Quality images")])).toBe("quality");
    expect(assessmentOf([cat("Category:Valued images")])).toBe("valued");
    expect(assessmentOf([cat("Category:Sunsets")])).toBeNull();
  });

  test("returns the highest tier when several apply", () => {
    expect(assessmentOf([cat("Category:Quality images"), cat("Category:Featured pictures on Wikimedia Commons")])).toBe(
      "featured",
    );
    expect(assessmentOf([cat("Category:Valued images"), cat("Category:Quality images")])).toBe("quality");
  });
});

describe("qualityScore ranking", () => {
  test("any assessment outranks any amount of usage or resolution", () => {
    const valued = qualityScore({ assessment: "valued", usageCount: 0, width: 1000, height: 800 });
    const heavilyUsed = qualityScore({ assessment: null, usageCount: 500, width: 6000, height: 4000 });
    expect(valued).toBeGreaterThan(heavilyUsed);
  });

  test("among non-assessed images, more usage wins over resolution", () => {
    const used = qualityScore({ assessment: null, usageCount: 50, width: 1200, height: 800 });
    const huge = qualityScore({ assessment: null, usageCount: 1, width: 8000, height: 6000 });
    expect(used).toBeGreaterThan(huge);
  });

  test("featured beats quality beats valued", () => {
    const base = { usageCount: 10, width: 2000, height: 1500 };
    const f = qualityScore({ ...base, assessment: "featured" });
    const q = qualityScore({ ...base, assessment: "quality" });
    const v = qualityScore({ ...base, assessment: "valued" });
    expect(f).toBeGreaterThan(q);
    expect(q).toBeGreaterThan(v);
  });
});
