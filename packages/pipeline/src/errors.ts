/**
 * An expected, user-facing failure (missing key, API error, no work to do). The
 * CLI prints `.message` cleanly and exits non-zero — no stack trace. Anything
 * that isn't a PipelineError is a bug and should surface its stack.
 */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}
