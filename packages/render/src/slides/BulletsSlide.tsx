import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Slide } from "@loom/spec";
import { easedEnter } from "../anim";
import { useScaledType } from "../type";

type BulletsContent = Extract<Slide, { layout: "bullets" }>["content"];

/** Milliseconds between consecutive bullets appearing, so they cascade in. */
const STAGGER_MS = 260;
/** Milliseconds each bullet takes to rise + fade in. */
const ENTER_MS = 530;
/** Delay before the first bullet, so the title settles first. */
const LEAD_MS = 330;

/**
 * A title with a staggered bullet list. Each item rises and fades in a few frames
 * after the previous one, so the list builds rather than appearing all at once.
 * An accent square marks each item; type scales down a little as the list grows
 * so long lists still fit.
 */
export function BulletsSlide({ content }: { content: BulletsContent }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { rem, px } = useScaledType();

  const titleEnter = easedEnter(frame, fps, 600);

  // Shrink the items a touch as the list gets long so it stays on-screen.
  const itemSize = content.items.length > 5 ? rem(2.4) : rem(2.9);

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
            fontSize: rem(4.2),
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: `0 0 ${rem(3.5)}`,
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
          const enter = easedEnter(frame, fps, ENTER_MS, LEAD_MS + i * STAGGER_MS);
          return (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: rem(1.5),
                margin: `0 0 ${rem(1.6)}`,
                opacity: enter,
                transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: rem(0.85),
                  height: rem(0.85),
                  borderRadius: px(3),
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
