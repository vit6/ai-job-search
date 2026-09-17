import { afterEach, describe, expect, test } from "bun:test";
import { resolveTagId } from "../src/helpers";

// resolveTagId drives two live-shaped endpoints (the autosuggest JSON array, then a
// tag landing page's __NEXT_DATA__ blob). These tests stub both offline so the
// resolution logic - not the network - is what's under test.

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function nextDataPage(tagId: string | number, tagTitle: string): string {
  const json = JSON.stringify({ props: { pageProps: { tagId, tagTitle } } });
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

describe("resolveTagId", () => {
  test("empty suggestions means no match, not an error", async () => {
    globalThis.fetch = (async () => new Response("[]")) as unknown as typeof fetch;
    const result = await resolveTagId("zzzznonsense");
    expect(result).toBeNull();
  });

  test("resolves an exact-match suggestion via its landing page tagId", async () => {
    let call = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      call++;
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/job/search/keyword")) {
        return new Response(JSON.stringify(["Python", "Python Architect"]));
      }
      if (url.includes("/k/python-jobs")) {
        return new Response(nextDataPage(9, "Python"));
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveTagId("python");
    expect(result).toEqual({ id: "9", name: "Python" });
    expect(call).toBeGreaterThanOrEqual(2);
  });

  test("tolerates a string-quoted tagId in the landing page JSON", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/job/search/keyword")) return new Response(JSON.stringify(["Java"]));
      if (url.includes("/k/java-jobs")) return new Response(nextDataPage("5", "Java"));
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveTagId("java");
    expect(result).toEqual({ id: "5", name: "Java" });
  });

  test("falls back to the next candidate if the first slug page 404s", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/job/search/keyword")) {
        return new Response(JSON.stringify(["Product Analyst", "Product Design"]));
      }
      if (url.includes("/k/product-analyst-jobs")) return new Response("", { status: 404 });
      if (url.includes("/k/product-design-jobs")) return new Response(nextDataPage(42, "Product Design"));
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveTagId("product");
    expect(result).toEqual({ id: "42", name: "Product Design" });
  });

  test("falls back word-by-word when the full multi-word query has no prefix match", async () => {
    // "python developer" doesn't prefix-match any tag (tags are skills like "Python",
    // not role titles), so resolution must fall back to the word "python".
    const seenQueries: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/job/search/keyword")) {
        const q = new URL(url).searchParams.get("query") ?? "";
        seenQueries.push(q);
        if (q.toLowerCase() === "python") return new Response(JSON.stringify(["Python"]));
        return new Response("[]");
      }
      if (url.includes("/k/python-jobs")) return new Response(nextDataPage(9, "Python"));
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveTagId("python developer");
    expect(result).toEqual({ id: "9", name: "Python" });
    expect(seenQueries).toContain("python developer");
    expect(seenQueries).toContain("python");
  });

  test("returns null when no candidate resolves", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/job/search/keyword")) return new Response(JSON.stringify(["Ghost Role"]));
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveTagId("ghost");
    expect(result).toBeNull();
  });
});
