import { describe, expect, test } from "bun:test";
import {
  areaPath,
  formatNumber,
  linePath,
  makeBandScale,
  makePointScale,
  makeYScale,
  niceCeil,
  pieSlices,
  polar,
  seriesColor,
  wedgePath,
  yDomain,
} from "./chart-math";

describe("niceCeil", () => {
  test("rounds up to 1/2/2.5/5 × 10ⁿ", () => {
    expect(niceCeil(0.8)).toBe(1);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(2.3)).toBe(2.5);
    expect(niceCeil(42)).toBe(50);
    expect(niceCeil(1200)).toBe(2000);
  });

  test("exact nice values are unchanged", () => {
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(100)).toBe(100);
    expect(niceCeil(2.5)).toBe(2.5);
  });

  test("non-positive input is zero", () => {
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(-5)).toBe(0);
  });
});

describe("yDomain", () => {
  const rows = [
    { x: "a", v: 8, w: 2 },
    { x: "b", v: 6, w: 3 },
    { x: "c", v: 9, w: 5 },
  ];

  test("positive data: min pinned to 0, max rounded up nicely", () => {
    expect(yDomain(rows, ["v", "w"])).toEqual({ min: 0, max: 10 });
  });

  test("negative data extends the min outward", () => {
    const d = yDomain([{ x: "a", v: -3 }, { x: "b", v: 7 }], ["v"]);
    expect(d.min).toBe(-5);
    expect(d.max).toBe(10);
  });

  test("non-numeric / empty falls back to [0, 1]", () => {
    expect(yDomain([], ["v"])).toEqual({ min: 0, max: 1 });
    expect(yDomain([{ x: "a", v: "nope" }], ["v"])).toEqual({ min: 0, max: 1 });
  });
});

describe("makeYScale", () => {
  test("maps domain min→bottom and max→top, linearly", () => {
    const s = makeYScale({ min: 0, max: 10 }, 100, 500); // topY=100, bottomY=500
    expect(s(0)).toBe(500);
    expect(s(10)).toBe(100);
    expect(s(5)).toBe(300);
  });

  test("flat domain doesn't divide by zero", () => {
    const s = makeYScale({ min: 0, max: 0 }, 100, 500);
    expect(Number.isFinite(s(0))).toBe(true);
  });
});

describe("makeBandScale", () => {
  test("centers are evenly spaced and the group fits inside the band", () => {
    const b = makeBandScale(4, 0, 400, 0.2);
    expect(b.step).toBe(100);
    expect(b.center(0)).toBe(50);
    expect(b.center(3)).toBe(350);
    expect(b.bandWidth).toBeCloseTo(80);
    // band group starts after the inner padding
    expect(b.start(0)).toBeCloseTo(10);
  });

  test("count of zero is treated as one band", () => {
    const b = makeBandScale(0, 0, 100);
    expect(Number.isFinite(b.step)).toBe(true);
  });
});

describe("makePointScale", () => {
  test("first point sits at left, last at right", () => {
    const p = makePointScale(5, 0, 400);
    expect(p(0)).toBe(0);
    expect(p(4)).toBe(400);
    expect(p(2)).toBe(200);
  });

  test("a single point centers", () => {
    const p = makePointScale(1, 0, 400);
    expect(p(0)).toBe(200);
  });
});

describe("path builders", () => {
  test("linePath starts with a move then line commands", () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M 0 0 L 10 5");
    expect(linePath([])).toBe("");
  });

  test("areaPath closes back to the baseline", () => {
    const d = areaPath([{ x: 0, y: 0 }, { x: 10, y: 5 }], 100);
    expect(d.startsWith("M 0 0 L 10 5")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("L 10 100");
    expect(d).toContain("L 0 100");
  });
});

describe("pie geometry", () => {
  test("fractions sum to 1 and sweep a full circle", () => {
    const slices = pieSlices([1, 2, 1]);
    const fracs = slices.reduce((s, x) => s + x.fraction, 0);
    expect(fracs).toBeCloseTo(1);
    const sweep = slices[slices.length - 1]!.endAngle - slices[0]!.startAngle;
    expect(sweep).toBeCloseTo(Math.PI * 2);
  });

  test("starts at the top by default", () => {
    expect(pieSlices([1])[0]!.startAngle).toBeCloseTo(-Math.PI / 2);
  });

  test("negative values are clamped to zero", () => {
    const slices = pieSlices([3, -5, 1]);
    expect(slices[1]!.value).toBe(0);
    expect(slices[1]!.fraction).toBe(0);
  });

  test("all-zero values produce no sweep (no NaN)", () => {
    const slices = pieSlices([0, 0]);
    expect(slices.every((s) => s.fraction === 0)).toBe(true);
  });

  test("polar maps angle 0 to the right of center", () => {
    const p = polar(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(100);
  });

  test("wedgePath flags the large arc past a half turn", () => {
    const small = wedgePath(0, 0, 10, 0, Math.PI / 2); // quarter turn
    const big = wedgePath(0, 0, 10, 0, Math.PI * 1.5); // three-quarter turn
    expect(small).toContain(" 0 0 1 "); // largeArc flag = 0
    expect(big).toContain(" 0 1 1 "); // largeArc flag = 1
    expect(small.startsWith("M 0 0")).toBe(true);
  });
});

describe("series colors + formatting", () => {
  test("series colors cycle through the palette", () => {
    expect(seriesColor(0)).toBe("var(--accent)");
    expect(seriesColor(6)).toBe(seriesColor(0));
  });

  test("formatNumber abbreviates thousands", () => {
    expect(formatNumber(12000)).toBe("12k");
    expect(formatNumber(1500)).toBe("1.5k");
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(3.5)).toBe("3.5");
  });
});
