import { describe, expect, test } from "bun:test";
import { parseProject } from "@loom/spec";
import { attachMusic, MUSIC_REL } from "./music";
import { PipelineError } from "./errors";

const ROOT = "/tmp/loom-test"; // never touched: every case here avoids ffmpeg/disk.

/** A project with an existing music bed at known levels. */
function withMusic() {
  return parseProject({ id: "demo", music: { track: "assets/music/bed.mp3", volume: 0.3, duckTo: 0.1 } });
}

describe("attachMusic", () => {
  test("clears an existing bed", () => {
    const { project, result } = attachMusic(withMusic(), ROOT, { clear: true });
    expect(result.action).toBe("cleared");
    expect(project.music).toBeUndefined();
  });

  test("clearing with no bed is a clean error", () => {
    const bare = parseProject({ id: "demo" });
    expect(() => attachMusic(bare, ROOT, { clear: true })).toThrow(PipelineError);
  });

  test("retunes levels on an existing bed without touching the track", () => {
    const { project, result } = attachMusic(withMusic(), ROOT, { volume: 0.2, duckTo: 0.05 });
    expect(result.action).toBe("updated");
    expect(project.music).toEqual({ track: "assets/music/bed.mp3", volume: 0.2, duckTo: 0.05 });
  });

  test("a partial level update keeps the other level", () => {
    const { project } = attachMusic(withMusic(), ROOT, { volume: 0.5 });
    expect(project.music).toMatchObject({ volume: 0.5, duckTo: 0.1 });
  });

  test("tuning levels with no bed yet is a clean error", () => {
    const bare = parseProject({ id: "demo" });
    expect(() => attachMusic(bare, ROOT, { volume: 0.4 })).toThrow(/no music bed yet/);
  });

  test("a no-op call (no import, no levels, no clear) is a clean error", () => {
    expect(() => attachMusic(withMusic(), ROOT, {})).toThrow(/nothing to do/);
  });

  test("importing a missing file is a clean error (before any ffmpeg work)", () => {
    const bare = parseProject({ id: "demo" });
    expect(() => attachMusic(bare, ROOT, { importFile: "/no/such/file.mp3" })).toThrow(/music file not found/);
  });

  test("MUSIC_REL is a project-relative path the spec accepts", () => {
    // Sanity: the slot we write to round-trips through the Music schema.
    const p = parseProject({ id: "demo", music: { track: MUSIC_REL } });
    expect(p.music?.track).toBe(MUSIC_REL);
  });
});
