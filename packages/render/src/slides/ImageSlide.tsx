import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Motion, Slide } from "@loom/spec";
import { kenBurnsTransform } from "../motion";
import { CreditBadge } from "./CreditBadge";
import { ImagePlaceholder } from "./ImagePlaceholder";

type ImageContent = Extract<Slide, { layout: "image" }>["content"];

/** Full-bleed image slide with a (resolved) Ken Burns motion. */
export function ImageSlide({ content, motion }: { content: ImageContent; motion: Motion }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { transform, transformOrigin } = kenBurnsTransform(motion, progress);

  // A brief without a generated image yet — render a storyboard placeholder.
  if (!content.src) return <ImagePlaceholder prompt={content.prompt} />;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "var(--bg)" }}>
      <Img
        src={staticFile(content.src)}
        alt={content.alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: content.fit,
          transform,
          transformOrigin,
        }}
      />
      <CreditBadge credit={content.credit} />
    </AbsoluteFill>
  );
}
