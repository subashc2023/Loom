import { AbsoluteFill, interpolate } from "remotion";
import type { Slide } from "@loom/spec";
import { useEnter } from "../anim";
import { useScaledType } from "../type";

type TitleContent = Extract<Slide, { layout: "title" }>["content"];

/** Centered title card with an optional subtitle and an accent underline. */
export function TitleSlide({ content }: { content: TitleContent }) {
  // Gentle rise + fade on entry so a static card still feels alive.
  const enter = useEnter(600);
  const y = interpolate(enter, [0, 1], [24, 0]);
  const { rem, px } = useScaledType();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "0 10%",
      }}
    >
      <div style={{ opacity: enter, transform: `translateY(${y}px)` }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: rem(6.5),
            lineHeight: 1.05,
            margin: 0,
            letterSpacing: "-0.03em",
          }}
        >
          {content.title}
        </h1>
        <div
          style={{
            width: px(120),
            height: px(6),
            background: "var(--accent)",
            borderRadius: 3,
            margin: `${rem(2.5)} auto`,
          }}
        />
        {content.subtitle ? (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: rem(2.4),
              opacity: 0.8,
              margin: 0,
              fontWeight: 400,
            }}
          >
            {content.subtitle}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
