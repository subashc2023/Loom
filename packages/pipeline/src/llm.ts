import { generateObject, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";
import { requireKey } from "./env";
import { PipelineError } from "./errors";

/**
 * Provider-agnostic structured-generation client for the authoring stages
 * (plan, script). Built on the Vercel AI SDK's generateObject, which takes a Zod
 * schema directly and forces the model to return JSON matching it — so a swap
 * between providers is a one-line model change, and the schema is the single
 * source of truth (no hand-written JSON-Schema tool definitions).
 *
 * Models are addressed as `provider:model` (e.g. `openai:gpt-4o`,
 * `anthropic:claude-opus-4-8`). A bare id with no prefix is treated as Anthropic
 * for back-compat with older LOOM_MODEL / --model values.
 */

/** Default model for the authoring stages. PLAN.md calls for Opus on plan + script. */
export const DEFAULT_MODEL = "anthropic:claude-opus-4-8";

export function resolveModel(explicit?: string): string {
  return explicit || process.env.LOOM_MODEL || DEFAULT_MODEL;
}

type Provider = "anthropic" | "openai";

const PROVIDERS: Record<Provider, { keys: string[]; hint: string; make: (id: string) => LanguageModel }> = {
  anthropic: {
    keys: ["ANTHROPIC_API_KEY"],
    hint: "https://console.anthropic.com/settings/keys",
    make: (id) => anthropic(id),
  },
  openai: {
    keys: ["OPENAI_API_KEY"],
    hint: "https://platform.openai.com/api-keys",
    make: (id) => openai(id),
  },
};

const PROVIDER_KEYS = Object.keys(PROVIDERS) as Provider[];

/** Split a `provider:model` ref; a bare id defaults to Anthropic. */
function parseModelRef(ref: string): { provider: Provider; model: string } {
  const colon = ref.indexOf(":");
  if (colon === -1) return { provider: "anthropic", model: ref };
  const provider = ref.slice(0, colon);
  const model = ref.slice(colon + 1);
  if (!isProvider(provider)) {
    throw new PipelineError(
      `unknown LLM provider "${provider}" in model "${ref}". Use ${PROVIDER_KEYS.map((p) => `${p}:<model>`).join(" or ")}.`,
    );
  }
  if (!model) throw new PipelineError(`model id is missing after "${provider}:" in "${ref}".`);
  return { provider, model };
}

function isProvider(v: string): v is Provider {
  return v in PROVIDERS;
}

/**
 * Generate a value matching `schema` from the model. The model is forced to emit
 * structured JSON; the AI SDK validates it against the Zod schema, so a malformed
 * response fails loudly here rather than corrupting the spec.
 */
export async function generateStructured<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Names/describes the output for providers that use them as steering. */
  schemaName?: string;
  schemaDescription?: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const { provider, model } = parseModelRef(resolveModel(opts.model));
  const cfg = PROVIDERS[provider];
  // Friendly, actionable error before the SDK throws its own opaque one.
  requireKey(cfg.keys, cfg.hint);

  try {
    const { object } = await generateObject({
      model: cfg.make(model),
      schema: opts.schema,
      schemaName: opts.schemaName,
      schemaDescription: opts.schemaDescription,
      system: opts.system,
      prompt: opts.user,
      maxOutputTokens: opts.maxTokens ?? 8192,
      // OpenAI's *strict* Structured Outputs reject schemas with plain optional
      // fields (every property must be required). Our slide schemas are full of
      // optionals, so relax strict mode; the AI SDK still validates the response
      // against the Zod schema. Provider-namespaced, so non-OpenAI models ignore it.
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return object as T;
  } catch (e) {
    if (e instanceof PipelineError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new PipelineError(`${provider}:${model} call failed: ${msg.slice(0, 500)}`);
  }
}
