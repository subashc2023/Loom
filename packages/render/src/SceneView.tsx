import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { msToFrames, type Scene, type Transition } from "@loom/spec";
import { SlideView } from "./slides/SlideView";
import { Captions } from "./Captions";

/**
 * Render one scene: its narration audio plus its slides, each placed on the
 * scene-relative timeline. `incoming` is the *previous* scene's transition (the
 * spec models a transition as how a scene gives way to the next), used to
 * animate this scene's entrance so it crossfades/slides over the outgoing one.
 * `captions` toggles the burned-in word-level captions (project style setting).
 */
export function SceneView({
  scene,
  fps,
  incoming,
  captions,
  kenBurns,
}: {
  scene: Scene;
  fps: number;
  incoming: Transition | null;
  captions: boolean;
  kenBurns: boolean;
}) {
  const frame = useCurrentFrame();
  const entrance = useEntrance(frame, fps, incoming);

  return (
    <AbsoluteFill style={{ backgroundColor: "var(--bg)", ...entrance }}>
      {scene.audio ? <Audio src={staticFile(scene.audio.path)} /> : null}
      {scene.slides.map((slide) => (
        <Sequence
          key={slide.id}
          from={msToFrames(slide.startMs, fps)}
          durationInFrames={Math.max(1, msToFrames(slide.durationMs, fps))}
          name={`slide:${slide.id}`}
        >
          <SlideView slide={slide} kenBurns={kenBurns} />
        </Sequence>
      ))}
      {captions && scene.captions.length ? <Captions words={scene.captions} /> : null}
    </AbsoluteFill>
  );
}

/** CSS for this scene's entrance animation based on the incoming transition. */
function useEntrance(frame: number, fps: number, incoming: Transition | null): React.CSSProperties {
  if (!incoming || incoming.type === "cut") return {};
  const frames = Math.max(1, msToFrames(incoming.durationMs, fps));
  const t = interpolate(frame, [0, frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (incoming.type === "slide") {
    return { transform: `translateX(${interpolate(t, [0, 1], [100, 0])}%)` };
  }
  // fade
  return { opacity: t };
}
