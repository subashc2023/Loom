/* Tiny ANSI logger. Stays dependency-free; respects NO_COLOR. */
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  dim: wrap("2"),
  bold: wrap("1"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  cyan: wrap("36"),
};

export const log = {
  info: (msg: string) => console.log(msg),
  step: (msg: string) => console.log(`${c.cyan("›")} ${msg}`),
  ok: (msg: string) => console.log(`${c.green("✓")} ${msg}`),
  warn: (msg: string) => console.warn(`${c.yellow("!")} ${msg}`),
  err: (msg: string) => console.error(`${c.red("✗")} ${msg}`),
};

/** Print an error and exit non-zero. */
export function fail(msg: string): never {
  log.err(msg);
  process.exit(1);
}
