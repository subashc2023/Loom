import { describe, expect, test } from "bun:test";
import type { StockCandidate } from "./commons";
import { rasterUrl } from "./commons";
import { formatLicense, toCandidate as toOpenverseCandidate } from "./openverse";
import { dedupeStock } from "./stock";

const base: Omit<StockCandidate, "provider" | "sourceName" | "title" | "imageUrl"> = {
  pageUrl: "https://example.org/p",
  thumbUrl: "https://example.org/t.jpg",
  width: 2000,
  height: 1500,
  mime: "image/jpeg",
  license: "CC BY 4.0",
  author: "Someone",
  assessment: null,
  usageCount: 0,
  isVector: false,
  score: 0,
};

const commons = (over: Partial<StockCandidate>): StockCandidate => ({
  ...base,
  provider: "commons",
  sourceName: "Wikimedia Commons",
  title: "File:Foo.jpg",
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg",
  ...over,
});
const openverse = (over: Partial<StockCandidate>): StockCandidate => ({
  ...base,
  provider: "openverse",
  sourceName: "Openverse",
  title: "Foo",
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg",
  ...over,
});

describe("rasterUrl", () => {
  test("swaps the width segment of a Commons SVG thumb URL", () => {
    expect(rasterUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Bar.svg/480px-Bar.svg.png", 1920)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Bar.svg/1920px-Bar.svg.png",
    );
  });
  test("leaves a URL without a width segment unchanged", () => {
    expect(rasterUrl("https://example.org/plain.png", 1920)).toBe("https://example.org/plain.png");
  });
});

describe("formatLicense (Openverse)", () => {
  test("builds readable CC names from code + version", () => {
    expect(formatLicense("by", "2.0")).toBe("CC BY 2.0");
    expect(formatLicense("by-sa", "4.0")).toBe("CC BY-SA 4.0");
    expect(formatLicense("cc0", "1.0")).toBe("CC0");
    expect(formatLicense("pdm", undefined)).toBe("Public domain");
  });
  test("returns null when no licence is present", () => {
    expect(formatLicense(undefined, undefined)).toBeNull();
  });
});

describe("toOpenverseCandidate", () => {
  test("maps a normal raster result", () => {
    const c = toOpenverseCandidate({
      title: "A sky",
      creator: "Jane",
      url: "https://cdn.example.org/sky.jpg",
      thumbnail: "https://cdn.example.org/sky-thumb.jpg",
      foreign_landing_url: "https://flickr.com/x",
      license: "by",
      license_version: "2.0",
      width: 3000,
      height: 2000,
      filetype: "jpg",
      source: "flickr",
    });
    expect(c).not.toBeNull();
    expect(c!.provider).toBe("openverse");
    expect(c!.license).toBe("CC BY 2.0");
    expect(c!.pageUrl).toBe("https://flickr.com/x");
    expect(c!.assessment).toBeNull();
  });
  test("drops results without dimensions or with non-raster types", () => {
    expect(toOpenverseCandidate({ url: "https://x/y.jpg" })).toBeNull(); // no width/height
    expect(toOpenverseCandidate({ url: "https://x/y.svg", width: 1000, height: 800, filetype: "svg" })).toBeNull();
  });
});

describe("dedupeStock", () => {
  test("collapses the same file from two providers, keeping Commons", () => {
    const out = dedupeStock([openverse({ score: 50 }), commons({ score: 10 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.provider).toBe("commons"); // Commons wins despite lower score — richer metadata
  });
  test("keeps genuinely different files", () => {
    const out = dedupeStock([
      commons({ title: "File:Foo.jpg" }),
      commons({ title: "File:Bar.jpg", imageUrl: "https://x/Bar.jpg" }),
    ]);
    expect(out).toHaveLength(2);
  });
  test("matches across URL-encoding and spaces/underscores", () => {
    const out = dedupeStock([
      commons({ title: "File:Red sky at dusk.jpg" }),
      openverse({ imageUrl: "https://upload.wikimedia.org/.../Red_sky_at_dusk.jpg" }),
    ]);
    expect(out).toHaveLength(1);
  });
});
