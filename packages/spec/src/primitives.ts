import { z } from "zod";

/**
 * A hex color string, e.g. "#0a0a0a" or "#fff". Validated loosely — we accept
 * 3, 4, 6, or 8 digit hex so alpha is allowed.
 */
export const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: "must be a hex color like #0a0a0a",
  });
export type HexColor = z.infer<typeof HexColor>;

/**
 * A non-negative duration or offset in milliseconds. Integer — sub-ms timing is
 * meaningless at any sane frame rate and keeps math exact.
 */
export const Ms = z.number().int().nonnegative();
export type Ms = z.infer<typeof Ms>;

/**
 * A relative path (POSIX-style) into the project's asset tree, e.g.
 * "assets/images/scene-001-slide-001.png". Always project-relative so a project
 * folder is portable. Never absolute, never traversing upward.
 */
export const AssetPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !/^[A-Za-z]:/.test(p), {
    message: "asset paths must be project-relative, not absolute",
  })
  .refine((p) => !p.split(/[\\/]/).includes(".."), {
    message: "asset paths must not traverse upward with '..'",
  });
export type AssetPath = z.infer<typeof AssetPath>;

/**
 * A normalized rectangle in [0,1] coordinates relative to the frame. Used for
 * Ken Burns motion: {x,y} is the top-left of the visible region, {width,height}
 * its size. The whole frame is {x:0,y:0,width:1,height:1}.
 */
export const Rect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Rect = z.infer<typeof Rect>;
