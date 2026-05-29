import { AbsoluteFill } from "remotion";

/**
 * Shown in place of an image whose `src` hasn't been generated yet (a slide that
 * exists as a brief). Keeps a freshly-`plan`ned project renderable — you can see
 * the structure before running `loom slides`. The brief prompt is surfaced so the
 * draft doubles as a storyboard.
 */
export function ImagePlaceholder({ prompt, label }: { prompt?: string; label?: string }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "var(--bg)",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 24px, rgba(255,255,255,0) 24px 48px)",
        alignItems: "center",
        justifyContent: "center",
        padding: "8%",
        textAlign: "center",
        color: "var(--fg)",
      }}
    >
      <div style={{ opacity: 0.55, maxWidth: "70%" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.6rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: "1.25rem",
          }}
        >
          {label ?? "Image pending"}
        </div>
        {prompt ? (
          <div style={{ fontFamily: "var(--font-body)", fontSize: "1.9rem", lineHeight: 1.4 }}>
            {prompt}
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-body)", fontSize: "1.6rem", opacity: 0.7 }}>
            run <code>loom slides</code> to generate
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}
