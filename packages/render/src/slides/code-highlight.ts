/**
 * Pure helpers for the `code` layout: line splitting, a tiny line-scoped syntax
 * tokenizer, diff-line classification, and font-fitting math. Kept out of the
 * React component so the fiddly logic is unit-testable (mirrors chart-math.ts).
 *
 * The tokenizer is deliberately line-scoped and approximate — it does NOT track
 * strings or comments that span multiple lines. That's fine for the short
 * snippets a slide shows, and it keeps every function a pure string→data map.
 */

export type TokenKind = "keyword" | "string" | "comment" | "number" | "plain";
export interface Token {
  text: string;
  kind: TokenKind;
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isNumPart = (c: string) => isDigit(c) || c === "." || c === "_";
const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);

// Keyword sets per language family. JS/TS share one (the TS superset is
// harmless on JS); JSON only colors its literals; everything else defaults to
// the TS set, which is a reasonable backdrop for most C-family snippets.
const TS_JS = [
  "abstract", "any", "as", "async", "await", "boolean", "break", "case", "catch",
  "class", "const", "continue", "debugger", "declare", "default", "delete", "do",
  "else", "enum", "export", "extends", "false", "finally", "for", "from", "function",
  "get", "if", "implements", "import", "in", "instanceof", "interface", "is", "keyof",
  "let", "namespace", "never", "new", "null", "number", "of", "private", "protected",
  "public", "readonly", "return", "satisfies", "set", "static", "string", "super",
  "switch", "this", "throw", "true", "try", "type", "typeof", "undefined", "unknown",
  "var", "void", "while", "yield",
];

const PY = [
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "False", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass",
  "raise", "return", "self", "True", "try", "while", "with", "yield",
];

const JSON_KW = ["true", "false", "null"];

/** Normalize a language tag to a lowercase canonical family key. */
function langKey(language: string | undefined): string {
  return (language ?? "").trim().toLowerCase();
}

/** The keyword set the tokenizer should highlight for a given language. */
export function keywordsFor(language: string | undefined): ReadonlySet<string> {
  switch (langKey(language)) {
    case "py":
    case "python":
      return new Set(PY);
    case "json":
    case "json5":
      return new Set(JSON_KW);
    default:
      return new Set(TS_JS);
  }
}

/** The line-comment prefix for a language, or null if it has none. */
export function commentPrefixFor(language: string | undefined): string | null {
  switch (langKey(language)) {
    case "py":
    case "python":
    case "rb":
    case "ruby":
    case "sh":
    case "bash":
    case "zsh":
    case "yaml":
    case "yml":
    case "toml":
      return "#";
    case "json":
    case "json5":
      return null;
    default:
      return "//";
  }
}

/**
 * Split source into display lines: normalize CRLF/CR to LF and drop a single
 * trailing newline so the last row isn't an empty line.
 */
export function splitLines(code: string): string[] {
  const normalized = code.replace(/\r\n?/g, "\n");
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.split("\n");
}

/**
 * Tokenize a single line into colored segments. Recognizes (in priority order)
 * line comments, quoted strings, numbers, and keyword/identifier words; anything
 * else accumulates as plain text. Escapes inside strings are skipped so a `\"`
 * doesn't end the string early.
 */
export function tokenizeLine(
  line: string,
  keywords: ReadonlySet<string>,
  lineComment: string | null,
): Token[] {
  const tokens: Token[] = [];
  const n = line.length;
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, kind: "plain" });
      plain = "";
    }
  };

  while (i < n) {
    const c = line.charAt(i);

    // Line comment: the rest of the line is a comment.
    if (lineComment && line.startsWith(lineComment, i)) {
      flush();
      tokens.push({ text: line.slice(i), kind: "comment" });
      return tokens;
    }

    // String literal (single line; unterminated runs to end of line).
    if (c === '"' || c === "'" || c === "`") {
      flush();
      let j = i + 1;
      while (j < n) {
        const cj = line.charAt(j);
        if (cj === "\\") {
          j += 2;
          continue;
        }
        if (cj === c) {
          j += 1;
          break;
        }
        j += 1;
      }
      const end = Math.min(j, n);
      tokens.push({ text: line.slice(i, end), kind: "string" });
      i = end;
      continue;
    }

    // Number (incl. hex, decimals, separators, exponent).
    if (isDigit(c) || (c === "." && isDigit(line.charAt(i + 1)))) {
      flush();
      let j = i;
      if (c === "0" && (line.charAt(i + 1) === "x" || line.charAt(i + 1) === "X")) {
        j = i + 2;
        while (j < n && isHex(line.charAt(j))) j += 1;
      } else {
        while (j < n && isNumPart(line.charAt(j))) j += 1;
        if (line.charAt(j) === "e" || line.charAt(j) === "E") {
          j += 1;
          if (line.charAt(j) === "+" || line.charAt(j) === "-") j += 1;
          while (j < n && isDigit(line.charAt(j))) j += 1;
        }
      }
      tokens.push({ text: line.slice(i, j), kind: "number" });
      i = j;
      continue;
    }

    // Identifier or keyword.
    if (isIdentStart(c)) {
      flush();
      let j = i;
      while (j < n && isIdentPart(line.charAt(j))) j += 1;
      const word = line.slice(i, j);
      tokens.push({ text: word, kind: keywords.has(word) ? "keyword" : "plain" });
      i = j;
      continue;
    }

    plain += c;
    i += 1;
  }

  flush();
  return tokens;
}

export type DiffKind = "add" | "del" | "meta" | "context";

/**
 * Classify a unified-diff line by its leading marker: `+`/`-` are additions and
 * removals, `@@`/`+++`/`---` are hunk/file headers (meta), everything else is
 * unchanged context.
 */
export function classifyDiffLine(line: string): DiffKind {
  if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

/**
 * Pick a monospace font size (px) so the longest line fits the box width and all
 * lines fit its height, clamped to a legible range. Assumes ~0.62em advance per
 * character and 1.5em line height.
 */
export function fitFontPx(lines: string[], box: { width: number; height: number }): number {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const count = Math.max(1, lines.length);
  const byWidth = box.width / (longest * 0.62);
  const byHeight = box.height / (count * 1.5);
  return Math.max(13, Math.min(40, Math.min(byWidth, byHeight)));
}
