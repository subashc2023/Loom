import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { framesToMs, type CaptionWord } from "@loom/spec";

/**
 * Word-level captions burned in over a scene, with a current-word highlight.
 *
 * The full narration would be a wall of text, so we chunk words into short
 * lines and only show the line covering the current moment. Within that line the
 * word being spoken right now gets an accent pill; words already spoken stay
 * solid, upcoming words dim. Everything is frame-driven (no CSS transitions —
 * Remotion renders discrete frames), so the highlight steps cleanly word to word.
 *
 * Timing is scene-relative ms, matching `useCurrentFrame()` inside the scene's
 * Sequence.
 */

// Wrap a line once it would exceed this many characters, so captions stay to
// one or two short lines. Narrower (portrait) frames wrap sooner.
const MAX_LINE_CHARS_WIDE = 38;
const MAX_LINE_CHARS_NARROW = 24;
// A silence longer than this starts a new line even mid-phrase.
const LINE_GAP_MS = 700;

type Line = { words: CaptionWord[]; startMs: number; endMs: number };

export function Captions({ words }: { words: CaptionWord[] }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = framesToMs(frame, fps);
  const portrait = height > width;

  const lines = useMemo(
    () => groupLines(words, portrait ? MAX_LINE_CHARS_NARROW : MAX_LINE_CHARS_WIDE),
    [words, portrait],
  );

  // The line to show: the last one that has started. Before the first word, show
  // nothing so captions don't precede speech.
  let active: Line | undefined;
  for (const line of lines) {
    if (line.startMs <= ms) active = line;
    else break;
  }
  if (!active) return null;

  // Index of the word currently (or most recently) being spoken in this line.
  let activeIndex = -1;
  for (let i = 0; i < active.words.length; i++) {
    if (active.words[i]!.startMs <= ms) activeIndex = i;
    else break;
  }
  // Once the whole line is in the past, drop the highlight rather than leaving
  // it stuck on the final word through the next silence.
  const lineDone = ms > active.endMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        // Lower on the screen and out of the way of slide text. Portrait frames
        // keep a bit more bottom margin to clear phone UI / home indicators.
        padding: portrait ? "0 5% 5%" : "0 6% 3%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.14em 0.28em",
          maxWidth: portrait ? "94%" : "82%",
          textAlign: "center",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: "2.0rem",
          lineHeight: 1.25,
        }}
      >
        {active.words.map((w, i) => (
          <Word key={i} text={w.text} state={wordState(i, activeIndex, lineDone)} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

type WordState = "current" | "spoken" | "upcoming";

function wordState(i: number, activeIndex: number, lineDone: boolean): WordState {
  if (!lineDone && i === activeIndex) return "current";
  if (i <= activeIndex) return "spoken";
  return "upcoming";
}

function Word({ text, state }: { text: string; state: WordState }) {
  const current = state === "current";
  return (
    <span
      style={{
        padding: current ? "0.04em 0.26em" : "0.04em 0",
        borderRadius: "0.16em",
        background: current ? "var(--accent)" : "transparent",
        color: current ? "#ffffff" : "var(--fg)",
        opacity: state === "upcoming" ? 0.5 : 1,
        // Keep text legible over any slide image.
        textShadow: current ? "none" : "0 2px 14px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.95)",
        whiteSpace: "pre",
      }}
    >
      {text}
    </span>
  );
}

/** Chunk words into short, readable lines on length and silence boundaries. */
function groupLines(words: CaptionWord[], maxChars: number): Line[] {
  const lines: Line[] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;

  const flush = () => {
    if (!cur.length) return;
    lines.push({
      words: cur,
      startMs: cur[0]!.startMs,
      endMs: cur[cur.length - 1]!.endMs,
    });
    cur = [];
    chars = 0;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = words[i - 1];
    const gap = prev ? w.startMs - prev.endMs : 0;
    const wouldOverflow = chars + w.text.length + 1 > maxChars;
    if (cur.length && (wouldOverflow || gap > LINE_GAP_MS)) flush();
    cur.push(w);
    chars += w.text.length + 1;
  }
  flush();
  return lines;
}
