import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Mandatory live smoke test per add-portal.md Step 4: hits the real portal. Keep volume
// low (a couple of requests) - this is not a crawl, just a sanity check that the live
// API still matches the shape url-reference.md documents.

describe("live: search", () => {
  test("a real query returns results with non-null id/title/url", async () => {
    const result = await runCLI(["search", "-q", "python developer", "--limit", "5"]);
    const data = parseJSON<{ meta: { count: number }; results: Array<{ id: string; title: string; url: string }> }>(result);
    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toContain("hirist.tech");
    }
  }, 30000);

  test("a bogus flag exits 1 with a JSON error (no network call needed)", async () => {
    const result = await runCLI(["search", "-q", "python", "--nope", "x"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("UNKNOWN_FLAG");
  });

  test("missing --query exits 1 with a JSON error", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_QUERY");
  });
});

describe("live: detail", () => {
  test("detail on an id from a live search returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-q", "python developer", "--limit", "1"]);
    const searchData = parseJSON<{ results: Array<{ id: string }> }>(searchResult);
    expect(searchData.results.length).toBeGreaterThan(0);
    const id = searchData.results[0].id;

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("<p>");
    expect(detailResult.stdout).not.toContain("&amp;");
  }, 30000);
});
