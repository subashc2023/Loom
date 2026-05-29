import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import type { Slide } from "@loom/spec";
import { ImagePlaceholder } from "./ImagePlaceholder";

type ManimContent = Extract<Slide, { layout: "manim" }>["content"];

/**
 * Plays a rendered Manim clip full-frame. `OffthreadVideo` is the
 * server-render-friendly player (Remotion extracts exact frames via ffmpeg), and
 * `muted` because narration is the scene's audio track, not the clip's.
 *
 * A slide whose clip hasn't been rendered yet (a brief carrying only
 * `sceneName`/`sceneSource`) shows a storyboard placeholder, so a planned project
 * stays watchable before `loom manim` runs — exactly like image briefs.
 */
export function ManimSlide({ content }: { content: ManimContent }) {
  if (!content.clip) {
    return <ImagePlaceholder label="Manim pending" prompt={content.sceneName} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "var(--bg)", overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(content.clip)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </AbsoluteFill>
  );
}
