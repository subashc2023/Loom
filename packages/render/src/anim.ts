import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Shared entrance-animation helpers. Two problems they solve over the old inline
 * `interpolate(frame, [0, 18], …)` calls scattered through the slide components:
 *
 *   - **fps-independence** — durations are expressed in milliseconds and converted
 *     against the real fps, so a 60fps render animates at the same speed a 30fps
 *     one does (the hardcoded frame counts ran twice as fast at 60fps).
 *   - **easing** — entrances decelerate instead of moving linearly, which is the
 *     single cheapest way to stop motion reading as mechanical.
 */

/** A soft decelerate so entrances settle rather than stop dead. */
export const EASE_OUT = Easing.out(Easing.cubic);

/** Eased in-out, for symmetric moves like a scene slide-in. */
export const EASE_IN_OUT = Easing.inOut(Easing.cubic);

/**
 * Eased 0..1 progress for an entrance that starts `delayMs` in and lasts
 * `durationMs`, given the current `frame` and `fps`. Pure — safe to call in a
 * loop (e.g. per bullet/line) since it isn't a hook.
 */
export function easedEnter(frame: number, fps: number, durationMs: number, delayMs = 0): number {
  const start = Math.round((delayMs / 1000) * fps);
  const dur = Math.max(1, Math.round((durationMs / 1000) * fps));
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
}

/** Hook form of {@link easedEnter} for a single, top-level entrance in a component. */
export function useEnter(durationMs = 500, delayMs = 0): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return easedEnter(frame, fps, durationMs, delayMs);
}
