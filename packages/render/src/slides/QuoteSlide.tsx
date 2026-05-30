import { AbsoluteFill, interpolate } from "remotion";
import type { Slide } from "@loom/spec";
import { useEnter } from "../anim";

type QuoteContent = Extract<Slide, { layout: "quote" }>["content"];

/**
 * A centered pull-quote: a large accent quotation mark, the quote in display
 * type, and an optional attribution that fades in just after the quote settles.
 * Long quotes step down a size so they still fit the frame.
 */
export function QuoteSlide({ content }: { content: QuoteContent }) {
  const enter = useEnter(730);
  // The attribution trails the quote so the eye lands on the words first.
  const attrEnter = useEnter(600, 530);

  const quoteSize = content.text.length > 120 ? "3.6rem" : "5rem";

  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "0 12%",
        backgroundColor: "var(--bg)",
      }}
    >
      <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)` }}>
        {/* Oversized accent quotation mark anchoring the card. */}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "9rem",
            lineHeight: 0.6,
            color: "var(--accent)",
            marginBottom: "1.5rem",
            // The glyph carries built-in side bearing; pull it back to center.
            marginLeft: "-0.1em",
          }}
        >
          &ldquo;
        </div>
        <blockquote
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: quoteSize,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {content.text}
        </blockquote>
        {content.attribution ? (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "2.2rem",
              opacity: attrEnter * 0.75,
              margin: "2.5rem 0 0",
              transform: `translateY(${interpolate(attrEnter, [0, 1], [12, 0])}px)`,
            }}
          >
            &mdash; {content.attribution}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
