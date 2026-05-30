import { useVideoConfig } from "remotion";

/**
 * Resolution- and aspect-aware typography scaling.
 *
 * Slide text was authored in `rem`, which resolves against the headless browser's
 * fixed 16px root regardless of the render resolution. That has two consequences:
 * a 4K render gets the *same* pixel-size text as a 720p one (so it looks tiny),
 * and a narrow 9:16/1:1 frame gets text tuned for a 1920px-wide column (so it
 * looks oversized and overflows). Both are fixed by scaling type with the render
 * width: text keeps the proportions it has on the reference 16:9 @ 1080p frame at
 * any resolution, and shrinks to fit a narrower column instead of overflowing.
 *
 * Charts and code already size themselves off `width`/`height` directly, so they
 * don't use this — it's for the rem-based text layouts (title, bullets, quote,
 * imageText).
 */

/** Width the text layouts were tuned against: 16:9 at 1080p. Scale is 1.0 here. */
const REFERENCE_WIDTH = 1920;

/** The raw multiplier: 1.0 at 1920px wide, 0.5 at 960px, 2.0 at 3840px. */
export function useTypeScale(): number {
  const { width } = useVideoConfig();
  return width / REFERENCE_WIDTH;
}

/**
 * A helper bound to the current frame's scale. `rem(n)` returns a scaled rem
 * string for font sizes/margins; `px(n)` scales a fixed pixel dimension (e.g. an
 * underline width). `scale` is exposed for the occasional inline calculation.
 */
export function useScaledType(): { scale: number; rem: (n: number) => string; px: (n: number) => number } {
  const scale = useTypeScale();
  return {
    scale,
    rem: (n) => `${(n * scale).toFixed(3)}rem`,
    px: (n) => n * scale,
  };
}
