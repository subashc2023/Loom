import { continueRender, delayRender } from "remotion";

/**
 * Embed the renderer's fonts so output is deterministic regardless of what the
 * render host has installed. We self-host via `@fontsource` (the woff2 files are
 * in node_modules and bundled by Remotion) rather than `@remotion/google-fonts`,
 * which fetches from Google's CDN at render time — that would add a network
 * dependency to a renderer that's otherwise a pure, offline function of the spec.
 *
 * Importing the CSS registers the `@font-face` rules; the weights here are the
 * ones the slide layouts actually use (Inter 400/700/800, JetBrains Mono 400/700),
 * latin subset to keep the bundle small. `theme.ts` names "Inter" / "JetBrains
 * Mono" first in its stacks, so these win over any system fallback.
 */
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";

/** Font specs to warm before the first frame, so glyphs aren't swapped mid-render. */
const FACES = [
  "400 1em Inter",
  "700 1em Inter",
  "800 1em Inter",
  '400 1em "JetBrains Mono"',
  '700 1em "JetBrains Mono"',
];

/**
 * Hold the render until the embedded fonts are actually loaded (the CSS above
 * declares them `font-display: swap`, so without this the first frames could
 * capture a fallback). Fails open: if loading errors — or `document.fonts` is
 * unavailable — we continue rather than hang, falling back to the CSS stack.
 */
function preloadFonts(): void {
  if (typeof document === "undefined" || !document.fonts) return;
  const handle = delayRender("Loading embedded fonts");
  Promise.all(FACES.map((f) => document.fonts.load(f)))
    .catch(() => undefined)
    .finally(() => continueRender(handle));
}

preloadFonts();
