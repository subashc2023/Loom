import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Slide } from "@loom/spec";
import { easedEnter } from "../anim";
import {
  classifyDiffLine,
  commentPrefixFor,
  fitFontPx,
  keywordsFor,
  splitLines,
  tokenizeLine,
  type DiffKind,
  type Token,
  type TokenKind,
} from "./code-highlight";

type CodeContent = Extract<Slide, { layout: "code" }>["content"];

/** Milliseconds between consecutive lines appearing, so the block types itself in. */
const STAGGER_MS = 100;
/** Milliseconds each line takes to rise + fade in. */
const ENTER_MS = 400;

/**
 * Fixed "editor" palette. The code card uses its own dark surface regardless of
 * the project theme (so snippets stay readable on light or dark slides), but the
 * keyword color and the emphasis bar are pulled from the theme accent so it
 * still reads as part of the brand.
 */
const SURFACE = "#0d1117";
const HEADER = "#161b22";
const BORDER = "rgba(255,255,255,0.09)";
const GUTTER_FG = "#6e7681";

const TOKEN_COLOR: Record<TokenKind, string> = {
  keyword: "var(--accent)",
  string: "#7ee787",
  number: "#d2a8ff",
  comment: "#8b949e",
  plain: "#e6edf3",
};

const DIFF_BG: Record<DiffKind, string | undefined> = {
  add: "rgba(63,185,80,0.16)",
  del: "rgba(248,81,73,0.16)",
  meta: undefined,
  context: undefined,
};
const DIFF_SIGN: Record<DiffKind, { glyph: string; color: string }> = {
  add: { glyph: "+", color: "#3fb950" },
  del: { glyph: "-", color: "#f85149" },
  meta: { glyph: "", color: GUTTER_FG },
  context: { glyph: "", color: GUTTER_FG },
};

/**
 * Render the `code` layout: a syntax-highlighted snippet in an editor card.
 * Lines cascade in (typed-on feel); `highlight` line numbers get an accent bar
 * while the rest dim, focusing the eye. When `language` is "diff", rows are
 * tinted green/red by their +/- marker and the gutter shows the sign instead of
 * line numbers. Sizing is fit to the longest line so it always stays on-screen.
 */
export function CodeSlide({ content }: { content: CodeContent }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const lines = splitLines(content.code);
  const isDiff = (content.language ?? "").trim().toLowerCase() === "diff";
  const keywords = keywordsFor(content.language);
  const comment = commentPrefixFor(content.language);
  const highlight = new Set(content.highlight ?? []);
  const hasFocus = highlight.size > 0;

  // Fit the type to the available card area (leaving room for chrome + gutter).
  const fontPx = fitFontPx(lines, { width: width * 0.72, height: height * 0.62 });
  const lineHeight = fontPx * 1.55;
  const gutterDigits = String(lines.length).length;

  const cardEnter = easedEnter(frame, fps, 400);
  const headerDelayMs = content.title ? 266 : 133;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 8%",
        backgroundColor: "var(--bg)",
      }}
    >
      <div
        style={{
          opacity: cardEnter,
          transform: `translateY(${interpolate(cardEnter, [0, 1], [28, 0])}px)`,
          maxWidth: "84%",
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          background: SURFACE,
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        {/* Title bar with traffic-light dots and an optional filename. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.9rem",
            padding: "0.95rem 1.4rem",
            background: HEADER,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
            <span
              key={c}
              style={{ width: 14, height: 14, borderRadius: "50%", background: c, opacity: 0.9 }}
            />
          ))}
          {content.title ? (
            <span
              style={{
                marginLeft: "0.6rem",
                fontFamily: "var(--font-body)",
                fontSize: "1.5rem",
                color: "#c9d1d9",
              }}
            >
              {content.title}
            </span>
          ) : null}
        </div>

        {/* Code body. */}
        <div
          style={{
            padding: `${fontPx * 0.9}px ${fontPx * 1.1}px`,
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace)",
            fontSize: fontPx,
            lineHeight: `${lineHeight}px`,
          }}
        >
          {lines.map((line, idx) => {
            const lineNo = idx + 1;
            const enter = easedEnter(frame, fps, ENTER_MS, headerDelayMs + idx * STAGGER_MS);

            const focused = highlight.has(lineNo);
            const diffKind: DiffKind = isDiff ? classifyDiffLine(line) : "context";

            // Dim non-focused lines once everything has settled.
            const focusDim = hasFocus && !focused ? 0.42 : 1;
            const rowBg = isDiff ? DIFF_BG[diffKind] : focused ? "rgba(255,255,255,0.06)" : undefined;

            // In diff mode the gutter is a +/- sign; otherwise a line number.
            const sign = DIFF_SIGN[diffKind];
            const tokens: Token[] = tokenizeLine(line, keywords, comment);

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  opacity: enter * focusDim,
                  transform: `translateY(${interpolate(enter, [0, 1], [8, 0])}px)`,
                  background: rowBg,
                  borderLeft: focused ? "4px solid var(--accent)" : "4px solid transparent",
                  marginLeft: -4,
                  paddingLeft: 0,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: `${(gutterDigits + 1) * 0.66}em`,
                    textAlign: "right",
                    paddingRight: "1.2em",
                    color: isDiff ? sign.color : GUTTER_FG,
                    userSelect: "none",
                  }}
                >
                  {isDiff ? sign.glyph : lineNo}
                </span>
                <code style={{ whiteSpace: "pre", color: TOKEN_COLOR.plain }}>
                  {diffKind === "meta" ? (
                    <span style={{ color: GUTTER_FG }}>{line}</span>
                  ) : (
                    tokens.map((t, ti) => (
                      <span
                        key={ti}
                        style={{
                          color: TOKEN_COLOR[t.kind],
                          fontWeight: t.kind === "keyword" ? 700 : 400,
                        }}
                      >
                        {t.text}
                      </span>
                    ))
                  )}
                </code>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
