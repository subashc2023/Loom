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
    // CodeSlide reads --font-mono; define it here so it isn't silently undefined.
    ["--font-mono" as string]: MONO_STACK,
    backgroundColor: palette.bg,
    color: palette.fg,
    fontFamily: fontStack(fonts.body),
  };
}

const SANS_FALLBACK = `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const SERIF_FALLBACK = `Georgia, Cambria, "Times New Roman", Times, serif`;
// "JetBrains Mono" is embedded (see fonts.ts), so it leads the stack; the rest
// are system fallbacks for when the embed isn't present (e.g. Studio without it).
const MONO_STACK = `"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

/** Font names that should fall back to a serif stack, not the sans default. */
const SERIF_FONTS = new Set([
  "georgia",
  "times",
  "times new roman",
  "garamond",
  "playfair display",
  "merriweather",
  "pt serif",
  "lora",
  "noto serif",
  "source serif pro",
]);

/**
 * Wrap a font name in a cross-platform fallback stack. The generic family is
 * chosen to match the named font's category, so when the chosen font isn't
 * installed (common on a headless renderer) a serif display like Georgia falls
 * back to a serif — not a sans — and the typography still reads as intended.
 */
export function fontStack(name: string): string {
  const generic = SERIF_FONTS.has(name.trim().toLowerCase()) ? SERIF_FALLBACK : SANS_FALLBACK;
  return `"${name}", ${generic}`;
}
