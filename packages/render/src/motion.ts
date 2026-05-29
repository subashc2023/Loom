import { interpolate } from "remotion";
import type { Motion, Rect } from "@loom/spec";

/**
 * Compute the CSS transform for a Ken Burns slide at a given progress (0..1).
 * The motion's `from`/`to` are visible regions in [0,1] of the content; we zoom
 * so that region fills the frame. transform-origin must be "0 0" at the call
 * site. Returns a no-op transform for `none` or missing motion.
 *
 * Phase 1 ships static slides by default; this is here so motion in the spec is
 * honoured the moment the slides stage starts emitting it.
 */
export function kenBurnsTransform(
  motion: Motion | undefined,
  progress: number,
): { transform: string; transformOrigin: string } {
  if (!motion || motion.type === "none") {
    return { transform: "none", transformOrigin: "0 0" };
  }
  const r = lerpRect(motion.from, motion.to, progress);
  const scale = 1 / r.width;
  return {
    transform: `scale(${scale}) translate(${-r.x * 100}%, ${-r.y * 100}%)`,
    transformOrigin: "0 0",
  };
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  const m = (from: number, to: number) =>
    interpolate(t, [0, 1], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return {
    x: m(a.x, b.x),
    y: m(a.y, b.y),
    width: m(a.width, b.width),
    height: m(a.height, b.height),
  };
}
