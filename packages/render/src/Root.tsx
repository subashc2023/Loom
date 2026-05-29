import { Composition } from "remotion";
import { parseProject, totalDurationFrames, type Project } from "@loom/spec";
import { LoomVideo } from "./LoomVideo";
import { fixtureProject } from "./fixtures/fixture";

/**
 * Registers the LoomVideo composition. All of Remotion's required metadata —
 * dimensions, fps, duration — is derived from the project spec via
 * calculateMetadata, so the renderer is genuinely a pure function of project.json.
 * Swap defaultProps.project for a real project to render it.
 */
export function RemotionRoot() {
  return (
    <Composition
      id="LoomVideo"
      component={LoomVideo}
      // A 1-frame placeholder; calculateMetadata replaces all of this from the spec.
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ project: fixtureProject }}
      calculateMetadata={({ props }) => {
        // props.project may be a plain object (from CLI/Studio JSON), so re-validate.
        const project: Project = parseProject(props.project);
        const [width, height] = project.meta.resolution;
        return {
          props: { project },
          durationInFrames: Math.max(1, totalDurationFrames(project)),
          fps: project.meta.fps,
          width,
          height,
        };
      }}
    />
  );
}
