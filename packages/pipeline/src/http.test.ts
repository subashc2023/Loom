import { afterEach, describe, expect, test } from "bun:test";
import { fetchResilient, readJson } from "./http";
import { PipelineError } from "./errors";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub global fetch with a sequence of per-call handlers (last one repeats). */
function stubFetch(handlers: Array<() => Response | Promise<Response>>): () => number {
  let calls = 0;
  globalThis.fetch = (async () => {
    const h = handlers[Math.min(calls, handlers.length - 1)]!;
    calls++;
    return h();
  }) as typeof fetch;
  return () => calls;
}

describe("fetchResilient", () => {
  test("returns the response on first success without retrying", async () => {
    const calls = stubFetch([() => new Response("ok", { status: 200 })]);
    const res = await fetchResilient("http://x", {}, { service: "X", baseDelayMs: 0 });
    expect(res.status).toBe(200);
    expect(calls()).toBe(1);
  });

  test("retries a 500 and returns the eventual success", async () => {
    const calls = stubFetch([
      () => new Response("err", { status: 500 }),
      () => new Response("ok", { status: 200 }),
    ]);
    const res = await fetchResilient("http://x", {}, { service: "X", baseDelayMs: 0 });
    expect(res.status).toBe(200);
    expect(calls()).toBe(2);
  });

  test("retries a 429 (rate limit)", async () => {
    const calls = stubFetch([
      () => new Response("slow down", { status: 429 }),
      () => new Response("ok", { status: 200 }),
    ]);
    const res = await fetchResilient("http://x", {}, { service: "X", baseDelayMs: 0 });
    expect(res.status).toBe(200);
    expect(calls()).toBe(2);
  });

  test("returns the final non-ok response after exhausting retries (caller handles it)", async () => {
    const calls = stubFetch([() => new Response("down", { status: 503 })]);
    const res = await fetchResilient("http://x", {}, { service: "X", retries: 2, baseDelayMs: 0 });
    expect(res.status).toBe(503);
    expect(calls()).toBe(3); // first attempt + 2 retries
  });

  test("does NOT retry a non-retryable 4xx", async () => {
    const calls = stubFetch([() => new Response("nope", { status: 404 })]);
    const res = await fetchResilient("http://x", {}, { service: "X", retries: 3, baseDelayMs: 0 });
    expect(res.status).toBe(404);
    expect(calls()).toBe(1);
  });

  test("throws a PipelineError after persistent network failure", async () => {
    stubFetch([
      () => {
        throw new Error("ECONNRESET");
      },
    ]);
    const err = await fetchResilient("http://x", {}, { service: "Acme", retries: 1, baseDelayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as Error).message).toContain("could not reach Acme");
  });

  test("reports a timeout when the request aborts", async () => {
    stubFetch([
      () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
    ]);
    const err = await fetchResilient("http://x", {}, { service: "Acme", retries: 0, baseDelayMs: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as Error).message).toContain("timed out");
  });
});

describe("readJson", () => {
  test("parses a valid JSON body", async () => {
    const res = new Response(JSON.stringify({ a: 1 }), { status: 200 });
    expect(await readJson<{ a: number }>(res, "X")).toEqual({ a: 1 });
  });

  test("turns a non-JSON body into a clean PipelineError", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", { status: 200 });
    const err = await readJson(res, "Acme").catch((e) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as Error).message).toContain("Acme returned a non-JSON response");
  });
});
