import { describe, test, expect } from "bun:test";
import { slugify, stripHtml, normalizeJob, queryFallbacks } from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

describe("slugify", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(slugify("Data Scientist")).toBe("data-scientist");
  });
  test("collapses punctuation runs to a single hyphen", () => {
    expect(slugify("C++ / C# Developer")).toBe("c-c-developer");
  });
  test("trims leading/trailing hyphens", () => {
    expect(slugify("  Python!  ")).toBe("python");
  });
});

describe("stripHtml", () => {
  test("decodes entities and strips tags", () => {
    expect(stripHtml("<p>Hello &amp; welcome</p>")).toBe("Hello & welcome");
  });
  test("keeps paragraph breaks as newlines", () => {
    const out = stripHtml("<p>First</p><p>Second</p>");
    expect(out).toBe("First\nSecond");
  });
  test("converts <br> to newline", () => {
    expect(stripHtml("Line1<br/>Line2")).toBe("Line1\nLine2");
  });
});

describe("normalizeJob", () => {
  test("maps a full raw job", () => {
    const job = normalizeJob({
      id: 1671998,
      title: "Capgemini - Edge AI Architect ",
      min: 12,
      max: 22,
      createdTime: 1789583400000,
      locations: [{ id: 3, name: "Bangalore" }],
      tags: [{ id: 9, name: "Python", isMandatory: true }],
      companyData: { companyName: "Capgemini", ambitionBoxInfo: { aggregateRating: 3.6 } },
    });
    expect(job.id).toBe("1671998");
    expect(job.title).toBe("Capgemini - Edge AI Architect"); // trimmed
    expect(job.company).toBe("Capgemini");
    expect(job.location).toBe("Bangalore");
    expect(job.date).toBe("2026-09-16");
    expect(job.url).toBe("https://www.hirist.tech/j/1671998");
    expect(job.experienceMin).toBe(12);
    expect(job.experienceMax).toBe(22);
    expect(job.tags).toEqual(["Python"]);
    expect(job.companyRating).toBe(3.6);
  });

  test("missing fields become null, never omitted", () => {
    const job = normalizeJob({ id: 1, title: "Bare Job" });
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.date).toBeNull();
    expect(job.experienceMin).toBeNull();
    expect(job.experienceMax).toBeNull();
    expect(job.companyRating).toBeNull();
    expect(job.tags).toEqual([]);
  });

  test("prefers jobDetailUrl when present (detail responses)", () => {
    const job = normalizeJob({ id: 5, title: "X", jobDetailUrl: "https://www.hirist.tech/j/some-slug-5" });
    expect(job.url).toBe("https://www.hirist.tech/j/some-slug-5");
  });
});

describe("queryFallbacks", () => {
  test("single word yields just that word", () => {
    expect(queryFallbacks("python")).toEqual(["python"]);
  });
  test("multi-word query tries the full string, then shrinking prefixes, then each word", () => {
    expect(queryFallbacks("senior python developer")).toEqual([
      "senior python developer",
      "senior python",
      "senior",
      "python",
      "developer",
    ]);
  });
  test("dedupes case-insensitively", () => {
    expect(queryFallbacks("Python Python")).toEqual(["Python Python", "Python"]);
  });
  test("caps at 5 candidates", () => {
    expect(queryFallbacks("a b c d e f g").length).toBeLessThanOrEqual(5);
  });
});

describe("detail normalizeId", () => {
  test("accepts a bare numeric id", () => {
    expect(normalizeId("1671998")).toBe("1671998");
  });
  test("extracts id from a full job URL with slug", () => {
    expect(normalizeId("https://www.hirist.tech/j/capgemini-edge-ai-architect-1671998")).toBe("1671998");
  });
  test("extracts id from a slugless job URL", () => {
    expect(normalizeId("https://www.hirist.tech/j/1671998")).toBe("1671998");
  });
  test("returns null for unparseable input", () => {
    expect(normalizeId("not-a-job")).toBeNull();
  });
});
