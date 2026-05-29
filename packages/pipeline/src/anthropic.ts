import type { z } from "zod";
import { requireKey } from "./env";
import { PipelineError } from "./errors";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/**
 * Default model for the authoring stages. PLAN.md calls for Opus on plan + script.
 * Overridable per call (and via the CLI's --model / LOOM_MODEL) so users without
 * access to a given model, or who want cheaper drafts, aren't stuck.
 */
export const DEFAULT_MODEL = "claude-opus-4-8";

export function resolveModel(explicit?: string): string {
  return explicit || process.env.LOOM_MODEL || DEFAULT_MODEL;
}

/** A JSON-Schema-shaped tool definition for Claude tool-use. */
export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Call Claude and force it to answer through a single tool, giving us structured
 * JSON instead of prose to parse. The tool's input is validated against `schema`
 * so a malformed model response fails loudly here rather than corrupting the spec.
 */
export async function callClaudeTool<T>(opts: {
  system: string;
  user: string;
  tool: ClaudeTool;
  schema: z.ZodType<T>;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = requireKey(["ANTHROPIC_API_KEY"], "https://console.anthropic.com/settings/keys");
  const model = resolveModel(opts.model);

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 8192,
        system: opts.system,
        tools: [opts.tool],
        tool_choice: { type: "tool", name: opts.tool.name },
        messages: [{ role: "user", content: opts.user }],
      }),
    });
  } catch (e) {
    throw new PipelineError(`could not reach the Anthropic API: ${(e as Error).message}`);
  }

  if (!res.ok) {
    throw new PipelineError(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const block = data.content?.find((b) => b.type === "tool_use" && b.name === opts.tool.name);
  if (!block || block.input === undefined) {
    throw new PipelineError(`Claude (${model}) did not return the expected "${opts.tool.name}" tool call`);
  }

  const parsed = opts.schema.safeParse(block.input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
    throw new PipelineError(`Claude returned data that didn't match the expected shape:\n  - ${issues.join("\n  - ")}`);
  }
  return parsed.data;
}
