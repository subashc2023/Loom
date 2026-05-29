import { describe, expect, test } from "bun:test";
import {
  classifyDiffLine,
  commentPrefixFor,
  fitFontPx,
  keywordsFor,
  splitLines,
  tokenizeLine,
  type Token,
} from "./code-highlight";

const TS = keywordsFor("ts");

/** Compact a token list to "kind:text" pairs for readable assertions. */
const pairs = (toks: Token[]) => toks.map((t) => `${t.kind}:${t.text}`);

describe("splitLines", () => {
  test("splits on LF and drops a single trailing newline", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
  });

  test("normalizes CRLF and bare CR", () => {
    expect(splitLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
  });

  test("a blank line in the middle is preserved", () => {
    expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
  });
});

describe("keywordsFor / commentPrefixFor", () => {
  test("language families map to the right keyword set", () => {
    expect(keywordsFor("ts").has("interface")).toBe(true);
    expect(keywordsFor("python").has("def")).toBe(true);
    expect(keywordsFor("py").has("interface")).toBe(false);
    // JSON only colors its literals.
    expect(keywordsFor("json").has("true")).toBe(true);
    expect(keywordsFor("json").has("const")).toBe(false);
  });

  test("unknown / missing language defaults to the TS keyword set", () => {
    expect(keywordsFor(undefined).has("function")).toBe(true);
    expect(keywordsFor("rust").has("function")).toBe(true);
  });

  test("comment prefix depends on language; JSON has none", () => {
    expect(commentPrefixFor("ts")).toBe("//");
    expect(commentPrefixFor("py")).toBe("#");
    expect(commentPrefixFor("bash")).toBe("#");
    expect(commentPrefixFor("json")).toBeNull();
  });
});

describe("tokenizeLine", () => {
  test("keywords, identifiers, and punctuation are separated", () => {
    expect(pairs(tokenizeLine("const x = y;", TS, "//"))).toEqual([
      "keyword:const",
      "plain: ",
      "plain:x",
      "plain: = ",
      "plain:y",
      "plain:;",
    ]);
  });

  test("a non-keyword identifier stays plain (no substring keyword match)", () => {
    // "className" must not match the keyword "class".
    const toks = tokenizeLine("className", TS, "//");
    expect(pairs(toks)).toEqual(["plain:className"]);
  });

  test("strings are captured whole, including escaped quotes", () => {
    const toks = tokenizeLine('say("he\\"llo")', TS, "//");
    expect(toks.some((t) => t.kind === "string" && t.text === '"he\\"llo"')).toBe(true);
  });

  test("an unterminated string runs to end of line", () => {
    const toks = tokenizeLine('x = "oops', TS, "//");
    expect(toks[toks.length - 1]).toEqual({ text: '"oops', kind: "string" });
  });

  test("line comments swallow the rest of the line", () => {
    const toks = tokenizeLine("x = 1 // set x", TS, "//");
    expect(toks[toks.length - 1]).toEqual({ text: "// set x", kind: "comment" });
    // The hash is not a comment in a // language.
    expect(tokenizeLine("a # b", TS, "//").some((t) => t.kind === "comment")).toBe(false);
    // ...but it is when the prefix is "#".
    expect(tokenizeLine("a # b", TS, "#").some((t) => t.kind === "comment")).toBe(true);
  });

  test("numbers: decimals, hex, and exponents are one number token", () => {
    expect(tokenizeLine("3.14", TS, "//")).toEqual([{ text: "3.14", kind: "number" }]);
    expect(tokenizeLine("0xFF", TS, "//")).toEqual([{ text: "0xFF", kind: "number" }]);
    expect(tokenizeLine("1e-9", TS, "//")).toEqual([{ text: "1e-9", kind: "number" }]);
    // A leading dot decimal.
    expect(tokenizeLine(".5", TS, "//")).toEqual([{ text: ".5", kind: "number" }]);
  });

  test("an empty line yields no tokens", () => {
    expect(tokenizeLine("", TS, "//")).toEqual([]);
  });
});

describe("classifyDiffLine", () => {
  test("classifies additions, removals, headers, and context", () => {
    expect(classifyDiffLine("+ added")).toBe("add");
    expect(classifyDiffLine("- removed")).toBe("del");
    expect(classifyDiffLine("@@ -1,2 +1,3 @@")).toBe("meta");
    expect(classifyDiffLine("+++ b/file.ts")).toBe("meta");
    expect(classifyDiffLine("--- a/file.ts")).toBe("meta");
    expect(classifyDiffLine(" unchanged")).toBe("context");
    expect(classifyDiffLine("plain")).toBe("context");
  });
});

describe("fitFontPx", () => {
  test("clamps to a legible range", () => {
    // One short line in a big box would be huge → clamped to the max.
    expect(fitFontPx(["x"], { width: 4000, height: 4000 })).toBe(40);
    // Many long lines in a small box → clamped to the min.
    const many = Array.from({ length: 80 }, () => "x".repeat(200));
    expect(fitFontPx(many, { width: 400, height: 400 })).toBe(13);
  });

  test("the longest line and line count both constrain the size", () => {
    const wide = fitFontPx(["x".repeat(100)], { width: 1000, height: 1000 });
    const tall = fitFontPx(Array.from({ length: 100 }, () => "x"), { width: 1000, height: 1000 });
    // Each dimension independently drives the fit down from the max.
    expect(wide).toBeLessThan(40);
    expect(tall).toBeLessThan(40);
  });
});
