import type { Project } from "@loom/spec";

/**
 * Map a project's style tokens to CSS custom properties + a base font stack.
 * Layout components read these vars so a palette change in the spec restyles the
 * whole video with no component edits.
 */
export function themeStyle(project: Project): React.CSSProperties {
  const { palette, fonts } = project.style;
  return {
    // CSS variables consumed by layout components.
    ["--bg" as string]: palette.bg,
    ["--fg" as string]: palette.fg,
    ["--accent" as string]: palette.accent,
    ["--font-display" as string]: fontStack(fonts.display),
    ["--font-body" as string]: fontStack(fonts.body),
    backgroundColor: palette.bg,
    color: palette.fg,
    fontFamily: fontStack(fonts.body),
  };
}

/** Wrap a font name in a sensible cross-platform fallback stack. */
export function fontStack(name: string): string {
  return `"${name}", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
}
