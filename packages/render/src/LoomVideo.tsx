import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { layoutTimeline, msToFrames, musicVolumeAt, narrationIntervalsMs, type Project } from "@loom/spec";
import { SceneView } from "./SceneView";
import { themeStyle } from "./theme";

/**
 * The composition. A pure function of the project spec: it lays scenes onto the
 * absolute timeline (collapsing crossfade overlaps), mounts each as a Sequence,
 * and lets later scenes stack over earlier ones so entrance transitions read as
 * crossfades. Background music, if present, spans the whole piece.
 */
export function LoomVideo({ project }: { project: Project }) {
  const { fps } = project.meta;
  const timeline = layoutTimeline(project);
  const music = project.music;
  // Duck music under narration. Precompute the speech spans once; the per-frame
  // volume callback then reads off them (cheap) for a smooth sidechain-style dip.
  const narration = music ? narrationIntervalsMs(project) : [];

  return (
    <AbsoluteFill style={themeStyle(project)}>
      {music ? (
        <Audio
          src={staticFile(music.track)}
          loop
          volume={(f) =>
            musicVolumeAt({ frame: f, fps, intervals: narration, base: music.volume, duckTo: music.duckTo })
          }
        />
      ) : null}

      {timeline.map((t) => {
        // The entrance transition comes from the previous scene's outgoing one.
        const incoming = t.index > 0 ? project.scenes[t.index - 1]!.transition : null;
        return (
          <Sequence
            key={t.scene.id}
            from={msToFrames(t.startMs, fps)}
            durationInFrames={Math.max(1, msToFrames(t.durationMs, fps))}
            name={`scene:${t.scene.id}`}
          >
            <SceneView
              scene={t.scene}
              fps={fps}
              incoming={incoming}
              captions={project.style.captions}
              kenBurns={project.style.kenBurns}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
