import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Motion, Slide } from "@loom/spec";
import { useEnter } from "../anim";
import { kenBurnsTransform } from "../motion";
import { CreditBadge } from "./CreditBadge";
import { ImagePlaceholder } from "./ImagePlaceholder";

type ImageTextContent = Extract<Slide, { layout: "imageText" }>["content"];

/** The image half of an imageText slide, or a placeholder if not generated yet. */
function SlideImage({ content, motion }: { content: ImageTextContent; motion: Motion }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { transform, transformOrigin } = kenBurnsTransform(motion, progress);

  if (!content.src) return <ImagePlaceholder prompt={content.prompt} />;
  return (
    <Img
      src={staticFile(content.src)}
      alt={content.heading}
      style={{ width: "100%", height: "100%", objectFit: content.fit, transform, transformOrigin }}
    />
  );
}

/**
 * Image with a text panel. `position` decides whether the panel sits beside the
 * image (left/right → split) or overlaid as a gradient caption (top/bottom).
 * `motion` is the resolved Ken Burns move applied to the image.
 */
export function ImageTextSlide({ content, motion }: { content: ImageTextContent; motion: Motion }) {
  const enter = useEnter(600);

  const side = content.position === "left" || content.position === "right";
  if (side) return <SplitLayout content={content} enter={enter} motion={motion} />;
  return <OverlayLayout content={content} enter={enter} motion={motion} />;
}

function TextBlock({ content }: { content: ImageTextContent }) {
  return (
    <>
      {content.heading ? (
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "3.4rem",
            margin: "0 0 1rem",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {content.heading}
        </h2>
      ) : null}
      <p style={{ fontFamily: "var(--font-body)", fontSize: "2rem", lineHeight: 1.4, margin: 0 }}>
        {content.body}
      </p>
    </>
  );
}

function SplitLayout({ content, enter, motion }: { content: ImageTextContent; enter: number; motion: Motion }) {
  const { width, height } = useVideoConfig();
  // A side-by-side split is cramped in a tall (portrait/mobile) frame, so stack
  // it vertically there: image on top, text below.
  const portrait = height > width;
  const textFirst = content.position === "left";
  const slide = interpolate(enter, [0, 1], [textFirst ? -30 : 30, 0]);

  const image = (
    <div style={{ flex: portrait ? 1.4 : 1, overflow: "hidden" }}>
      <SlideImage content={content} motion={motion} />
    </div>
  );
  const text = (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: portrait ? "6% 8%" : "0 8%",
        opacity: enter,
        transform: portrait ? `translateY(${slide}px)` : `translateX(${slide}px)`,
      }}
    >
      <TextBlock content={content} />
    </div>
  );
  // Portrait always renders image-on-top; landscape honours left/right order.
  const imageLeads = portrait || !textFirst;
  return (
    <AbsoluteFill style={{ flexDirection: portrait ? "column" : "row", backgroundColor: "var(--bg)" }}>
      {imageLeads ? (
        <>
          {image}
          {text}
        </>
      ) : (
        <>
          {text}
          {image}
        </>
      )}
      <CreditBadge credit={content.credit} />
    </AbsoluteFill>
  );
}

function OverlayLayout({ content, enter, motion }: { content: ImageTextContent; enter: number; motion: Motion }) {
  const atTop = content.position === "top";
  return (
    <AbsoluteFill style={{ backgroundColor: "var(--bg)", overflow: "hidden" }}>
      <SlideImage content={content} motion={motion} />
      <AbsoluteFill
        style={{
          justifyContent: atTop ? "flex-start" : "flex-end",
          padding: "8%",
          background: `linear-gradient(${atTop ? "180deg" : "0deg"}, rgba(0,0,0,0.75), rgba(0,0,0,0) 45%)`,
        }}
      >
        <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`, color: "#fff" }}>
          <TextBlock content={content} />
        </div>
      </AbsoluteFill>
      <CreditBadge credit={content.credit} />
    </AbsoluteFill>
  );
}
