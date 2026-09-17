import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("Hirist CLI flag validation", () => {
  describe("existing validations (regression)", () => {
    test("missing --query exits 1 with NO_QUERY", async () => {
      const result = await runCLI(["search"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_QUERY");
    });

    test("missing detail id exits 1 with NO_ID", async () => {
      const result = await runCLI(["detail"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_ID");
    });
  });

  describe("numeric flag validation (network-free)", () => {
    for (const name of ["jobage", "page", "limit"]) {
      test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
        const result = await runCLI(["search", "-q", "python", `--${name}`, "1.5"]);
        expect(result.exitCode).not.toBe(0);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
        expect(err.error).toMatch(new RegExp(name));
      });

      test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
        const result = await runCLI(["search", "-q", "python", `--${name}`, "0"]);
        expect(result.exitCode).not.toBe(0);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
      });

      test(`--${name} non-numeric exits 1 with BAD_ARG`, async () => {
        const result = await runCLI(["search", "-q", "python", `--${name}`, "foo"]);
        expect(result.exitCode).not.toBe(0);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
      });
    }
  });

  describe("unknown flag rejection", () => {
    // add-portal.md's contract: "a bogus flag or missing required arg exits 1 with a
    // JSON error on stderr" - never silently discarded (a discarded filter changes what
    // the search returns with no error).
    test("a bogus --flag exits 1 with a JSON error instead of being silently discarded", async () => {
      const result = await runCLI(["search", "-q", "python", "--bogus-flag", "xyz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
      expect(error.error).toContain("--bogus-flag");
    });

    test("a bogus --flag on detail exits 1 with a JSON error", async () => {
      const result = await runCLI(["detail", "123", "--bogus-flag", "xyz"]);
      expect(result.exitCode).toBe(1);
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
    });
  });

  describe("help", () => {
    test("no command prints help and exits 1", async () => {
      const result = await runCLI([]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("hirist-cli");
    });

    test("search --help exits 0", async () => {
      // Matches the canonical (linkedin-search) pattern: help/h only short-circuits to
      // exit 0 when a command is present, so `--help` with no command is the same as no
      // command at all (exit 1) - `search --help` is the documented way to see usage.
      const result = await runCLI(["search", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("USAGE");
    });
  });
});
