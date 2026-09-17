# hirist-cli

CLI for searching IT/tech job listings on [Hirist.tech](https://www.hirist.tech) — India's
IT/tech-focused job board (formerly Hirist.com; part of the iimjobs/Hirist group).

**Data source**: Hirist's public API host (`gladiator.hirist.tech`) plus its public
Next.js pages, used to resolve free-text keywords to Hirist's internal tag IDs (see
`../url-reference.md` for exactly how and why).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/hirist-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Python roles, last 7 days
bun run src/cli.ts search -q "python developer" --jobage 7 --format table

# Java roles in Bangalore
bun run src/cli.ts search -q "java" -l "Bangalore" --format table

# Data science roles, top 5
bun run src/cli.ts search -q "data scientist" --limit 5 --format table

# Full detail for one job
bun run src/cli.ts detail 1671998 --format plain
```

See `../SKILL.md` for the full flag reference and notes.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Job title / skill / role, e.g. `"python developer"`, `"java"`, `"data scientist"`. Hirist is IT/tech-specific — non-tech queries often return zero results. |
| `--location` | `-l` | City filter, applied **client-side** (see Notes — the portal has no working server-side location facet this CLI could find). |
| `--jobage` | | Posted within N days, e.g. `1`, `7`, `30`. |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Notes

- `--query` is resolved to one of Hirist's internal tag IDs via its autosuggest endpoint
  plus the tag's own landing page — Hirist's own `query` parameter on the search API is
  a decoy that never filters by text (see `../url-reference.md`). If no tag matches, the
  CLI reports zero results rather than an error.
- `--location` over-fetches and filters client-side; it narrows what was already returned
  for the resolved tag rather than querying a portal-side location facet.
