/**
 * Pure helpers for the `manim` stage, kept out of the side-effecting module so the
 * path math and CLI-arg construction are unit-testable without a Manim install.
 *
 * The stage runs Manim Community's `manim render` on a scene file, which always
 * writes its output into a nested tree under `--media_dir`:
 *
 *   <mediaDir>/videos/<module>/<height>p<fps>/<SceneName>.mp4
 *
 * where `<module>` is the .py filename (no extension). We predict that path so the
 * produced clip can be copied to its canonical, re-rollable slot.
 */

/** Canonical clip path for a manim slide (where the rendered mp4 lands). */
export function clipRelPath(slideId: string): string {
  return `assets/manim/${slideId}.mp4`;
}

/** Where an inline `sceneSource` is written before rendering (kept for re-rolls). */
export function sourceRelPath(slideId: string): string {
  return `assets/manim/${slideId}.py`;
}

/** Scratch `--media_dir` for a slide's render; cleaned up after the clip is copied out. */
export function mediaDirRel(slideId: string): string {
  return `assets/manim/.render/${slideId}`;
}

/** Manim's module folder name for a scene file: the basename without `.py`. */
export function moduleName(sceneFile: string): string {
  const base = sceneFile.replace(/^.*[\\/]/, "");
  return base.replace(/\.py$/i, "");
}

/** Manim's per-quality subfolder name, e.g. 1080p30. */
export function qualityDir(height: number, fps: number): string {
  return `${height}p${Math.round(fps)}`;
}

/**
 * The path, relative to `--media_dir`, where `manim render` writes the clip for a
 * given scene file / scene name at this resolution and fps.
 */
export function producedClipSubpath(
  sceneFile: string,
  sceneName: string,
  height: number,
  fps: number,
): string {
  return `videos/${moduleName(sceneFile)}/${qualityDir(height, fps)}/${sceneName}.mp4`;
}

/**
 * Build the argument list for `manim render`. Resolution and fps are pinned to the
 * project so the clip matches the rest of the video; `-o` fixes the output filename
 * to the scene name so {@link producedClipSubpath} can locate it deterministically.
 */
export function manimArgs(opts: {
  sceneFile: string;
  sceneName: string;
  mediaDir: string;
  width: number;
  height: number;
  fps: number;
}): string[] {
  return [
    "render",
    "--media_dir",
    opts.mediaDir,
    "-r",
    `${opts.width},${opts.height}`,
    "--fps",
    String(opts.fps),
    "--format",
    "mp4",
    "-o",
    opts.sceneName,
    opts.sceneFile,
    opts.sceneName,
  ];
}
