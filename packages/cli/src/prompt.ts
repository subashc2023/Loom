import { spawn } from "node:child_process";
import * as readline from "node:readline";

/** One-shot line prompt; opens and closes a readline interface per question. */
export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Best-effort: open a file in the OS default application (an image viewer, for
 * slide variations). Never throws — if no opener exists the caller still has the
 * printed paths. Detached so it doesn't block the prompt.
 */
export function openInViewer(file: string): void {
  try {
    const [cmd, args]: [string, string[]] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", file]]
        : process.platform === "darwin"
          ? ["open", [file]]
          : ["xdg-open", [file]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* no opener available — paths are printed for the user */
    });
    child.unref();
  } catch {
    /* best effort */
  }
}
