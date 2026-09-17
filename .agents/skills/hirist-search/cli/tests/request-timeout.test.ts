import { afterEach, describe, expect, test } from "bun:test";
import { apiFetchJSON } from "../src/helpers";

// A stalled upstream connection would otherwise hang the CLI forever - fetch has no
// default timeout. Assert the request wrapper carries an AbortSignal timeout.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiFetchJSON request timeout", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    await apiFetchJSON("/job/keyword/");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
