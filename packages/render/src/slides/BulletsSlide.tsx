import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { Slide } from "@loom/spec";

type BulletsContent = Extract<Slide, { layout: "bullets" }>["content"];

/** Frames between consecutive bullets appearing, so they cascade in. */
const STAGGER = 8;
/** Frames each bullet takes to rise + fade in. */
const ENTER = 16;

/**
 * A title with a staggered bullet list. Each item rises and fades in a few frames
 * after the previous one, so the list builds rather than appearing all at once.
 * An accent square marks each item; type scales down a little as the list grows
 * so long lists still fit.
 */
export function BulletsSlide({ content }: { content: BulletsContent }) {
  const frame = useCurrentFrame();

  const titleEnter = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Shrink the items a touch as the list gets long so it stays on-screen.
  const itemSize = content.items.length > 5 ? "2.4rem" : "2.9rem";

  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 12%",
        backgroundColor: "var(--bg)",
      }}
    >
      {content.title ? (
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "4.2rem",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: "0 0 3.5rem",
            opacity: titleEnter,
            transform: `translateY(${interpolate(titleEnter, [0, 1], [24, 0])}px)`,
          }}
        >
          {content.title}
        </h2>
      ) : null}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {content.items.map((item, i) => {
          // Bullets start after the title has begun to settle.
          const start = 10 + i * STAGGER;
          const enter = interpolate(frame, [start, start + ENTER], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "1.5rem",
                margin: "0 0 1.6rem",
                opacity: enter,
                transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: "0.85rem",
                  height: "0.85rem",
                  borderRadius: 3,
                  background: "var(--accent)",
                  // Nudge the square onto the text baseline.
                  transform: "translateY(-0.15em)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: itemSize,
                  lineHeight: 1.3,
                }}
              >
                {item}
              </span>
            </li>
          );
        })}
      </ul>
    </AbsoluteFill>
  );
}
