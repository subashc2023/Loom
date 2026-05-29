import { AbsoluteFill } from "remotion";
import type { ImageCredit } from "@loom/spec";

/**
 * A small, unobtrusive attribution shown over a sourced (non-AI) image — bottom
 * corner, low-contrast, just enough to satisfy CC-BY-style licences without
 * pulling focus. AI-generated images carry no credit, so nothing renders.
 */
export function CreditBadge({ credit }: { credit?: ImageCredit }) {
  if (!credit) return null;
  const text = [credit.author || credit.title, credit.license, credit.source].filter(Boolean).join(" · ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-end", padding: "1.2%", pointerEvents: "none" }}>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.85rem",
          color: "rgba(255,255,255,0.82)",
          background: "rgba(0,0,0,0.42)",
          padding: "0.25em 0.6em",
          borderRadius: "0.3em",
          letterSpacing: "0.01em",
          maxWidth: "60%",
          textAlign: "right",
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  );
}
