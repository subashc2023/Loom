import { describe, expect, test } from "bun:test";
import {
  clipRelPath,
  manimArgs,
  mediaDirRel,
  moduleName,
  producedClipSubpath,
  qualityDir,
  sourceRelPath,
} from "./manim-cli";

describe("path helpers", () => {
  test("canonical clip / source / media-dir paths are derived from the slide id", () => {
    expect(clipRelPath("s9-1")).toBe("assets/manim/s9-1.mp4");
    expect(sourceRelPath("s9-1")).toBe("assets/manim/s9-1.py");
    expect(mediaDirRel("s9-1")).toBe("assets/manim/.render/s9-1");
  });
});

describe("moduleName", () => {
  test("strips the directory and the .py extension", () => {
    expect(moduleName("scene.py")).toBe("scene");
    expect(moduleName("assets/manim/s9-1.py")).toBe("s9-1");
    // Backslash separators (Windows) are handled too.
    expect(moduleName("assets\\manim\\s9-1.py")).toBe("s9-1");
    // A non-.py name passes through unchanged.
    expect(moduleName("scene")).toBe("scene");
  });
});

describe("qualityDir", () => {
  test("names the per-quality folder <height>p<fps>", () => {
    expect(qualityDir(1080, 30)).toBe("1080p30");
    expect(qualityDir(720, 60)).toBe("720p60");
    // fps is rounded to match Manim's integer folder naming.
    expect(qualityDir(1080, 29.97)).toBe("1080p30");
  });
});

describe("producedClipSubpath", () => {
  test("predicts Manim's nested output path under the media dir", () => {
    expect(producedClipSubpath("assets/manim/s9-1.py", "Intro", 1080, 30)).toBe(
      "videos/s9-1/1080p30/Intro.mp4",
    );
  });
});

describe("manimArgs", () => {
  test("pins resolution + fps and fixes the output filename to the scene name", () => {
    const args = manimArgs({
      sceneFile: "assets/manim/s9-1.py",
      sceneName: "Intro",
      mediaDir: "assets/manim/.render/s9-1",
      width: 1920,
      height: 1080,
      fps: 30,
    });
    expect(args).toEqual([
      "render",
      "--media_dir",
      "assets/manim/.render/s9-1",
      "-r",
      "1920,1080",
      "--fps",
      "30",
      "--format",
      "mp4",
      "-o",
      "Intro",
      "assets/manim/s9-1.py",
      "Intro",
    ]);
  });

  test("the output filename and the predicted subpath agree on the scene name", () => {
    const sceneFile = "assets/manim/s9-1.py";
    const sceneName = "Intro";
    const args = manimArgs({ sceneFile, sceneName, mediaDir: "m", width: 1920, height: 1080, fps: 30 });
    const sub = producedClipSubpath(sceneFile, sceneName, 1080, 30);
    // `-o <name>` ⇒ produced file is <name>.mp4, which is the tail of the subpath.
    expect(args[args.indexOf("-o") + 1]).toBe(sceneName);
    expect(sub.endsWith(`${sceneName}.mp4`)).toBe(true);
  });
});
