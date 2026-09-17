#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Hirist.tech's public JSON API (India, IT/tech
// roles). No external CLI framework, so it runs anywhere `bun` is available with zero
// install beyond the repo clone. See ../url-reference.md for the keyword-to-tag-ID
// resolution this CLI performs under the hood, and ../SKILL.md for usage.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `hirist-cli — search IT/tech jobs on Hirist.tech (India)

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title / skill / role to search. REQUIRED.
                          Resolved against Hirist's internal tag taxonomy (see
                          url-reference.md) - IT/tech terms work best.
  --location, -l <text>   Filter results by city (client-side substring match on the
                          location Hirist returns - see Notes in SKILL.md).
  --jobage <days>          Posted within N days, e.g. 1, 7, 30. Omit for all postings.
  --page <n>               1-indexed page. Default 1.
  --limit, -n <n>          Cap results emitted (client-side).
  --format <fmt>           json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "python developer" --jobage 7 --format table
  bun run src/cli.ts search -q "java" -l "Bangalore" --format table
  bun run src/cli.ts search -q "data scientist" --limit 5 --format table
  bun run src/cli.ts detail 1671998 --format plain

No authentication required. Data: Hirist.tech public API.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded filter
  // changes what the search returns with no error. See add-portal.md's contract.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined
    if (!query) {
      process.stderr.write(
        JSON.stringify({
          error: 'the --query/-q flag is required (e.g. -q "python developer")',
          code: "NO_QUERY",
        }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      // Number(), not parseInt(): parseInt truncates, so a fractional value would
      // silently round down instead of being rejected.
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      jobage = v
    }
    let page = 1
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = v
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage,
      page,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
