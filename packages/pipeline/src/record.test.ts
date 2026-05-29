import { describe, expect, test } from "bun:test";
import { captureArgs, captureInputFormat, firstDshowAudioDevice } from "./record";

describe("firstDshowAudioDevice", () => {
  test("modern ffmpeg format: (audio) tag on the name line", () => {
    const stderr = [
      `[dshow @ 000] "Integrated Camera" (video)`,
      `[dshow @ 000]   Alternative name "@device_pnp_\\\\?\\usb..."`,
      `[dshow @ 000] "Microphone (Realtek Audio)" (audio)`,
      `[dshow @ 000]   Alternative name "@device_cm_..."`,
    ].join("\n");
    expect(firstDshowAudioDevice(stderr)).toBe("Microphone (Realtek Audio)");
  });

  test("legacy ffmpeg format: section header then quoted names", () => {
    const stderr = [
      `[dshow @ 000] DirectShow video devices (some may be both video and audio devices)`,
      `[dshow @ 000]  "Integrated Camera"`,
      `[dshow @ 000]     Alternative name "@device_pnp_..."`,
      `[dshow @ 000] DirectShow audio devices`,
      `[dshow @ 000]  "Microphone (Realtek Audio)"`,
      `[dshow @ 000]     Alternative name "@device_cm_..."`,
    ].join("\n");
    expect(firstDshowAudioDevice(stderr)).toBe("Microphone (Realtek Audio)");
  });

  test("skips video devices and the Alternative name lines", () => {
    const stderr = [
      `[dshow @ 000] DirectShow video devices`,
      `[dshow @ 000]  "HD WebCam"`,
      `[dshow @ 000]     Alternative name "@device_pnp_webcam"`,
      `[dshow @ 000] DirectShow audio devices`,
      `[dshow @ 000]  "Stereo Mix"`,
    ].join("\n");
    expect(firstDshowAudioDevice(stderr)).toBe("Stereo Mix");
  });

  test("no audio device → undefined", () => {
    const stderr = `[dshow @ 000] DirectShow video devices\n[dshow @ 000]  "HD WebCam"`;
    expect(firstDshowAudioDevice(stderr)).toBeUndefined();
  });
});

describe("captureArgs", () => {
  test("wraps the device per platform and records mono 44.1kHz to the out file", () => {
    const args = captureArgs("My Mic", "out.wav");
    const fmt = captureInputFormat();
    expect(args).toContain(fmt);
    expect(args.at(-1)).toBe("out.wav");
    expect(args).toContain("-ac");
    expect(args[args.indexOf("-ac") + 1]).toBe("1");
    // dshow needs the audio= prefix; other formats pass the device verbatim.
    const input = args[args.indexOf("-i") + 1];
    expect(input).toBe(fmt === "dshow" ? "audio=My Mic" : "My Mic");
  });
});
