---
name: hirist-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for IT/tech job listings in India —
  software, data, AI/ML, DevOps, QA, mobile, backend/frontend, and related engineering
  roles — or look up a specific Hirist.tech job posting. Trigger phrases: find a job,
  job search, search for jobs, job openings, vacancies, hiring, tech jobs in India,
  developer jobs, "are there any python/java/data jobs", look up this Hirist job,
  naukri alternative, IT job portal India.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/hirist-search/cli/src/cli.ts *)
---

# Hirist.tech Search Skill

Search live IT/tech job listings from [Hirist.tech](https://www.hirist.tech), India's
IT-focused job board (part of the iimjobs/Hirist group). No authentication, no API key,
and **zero runtime dependencies** — it runs with just `bun`.

> Market-specific worked example of the repo's job-portal-skill pattern, generated via
> `/add-portal`. Hirist is IT/tech-only — it is not a general-purpose board like Naukri
> or Indeed, so expect weak or no results for non-tech roles.

## When to use this skill

- Search for IT/tech job openings in India by role, skill, or technology
- Filter by recency (posted in the last N days) or city
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/hirist-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Job title, skill, or role, e.g. `"python developer"`, `"java"`, `"data scientist"`.
- `--location <text>` / `-l <text>` — city filter, applied client-side (see Notes).
- `--jobage <days>` — posted within N days, e.g. `1`, `7`, `30`. Omit for all postings.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/hirist-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (e.g. `1672163`). A full `hirist.tech/j/...`
URL also works. Returns the full description, experience range, skill tags, and company
rating (from AmbitionBox, where available).

## Usage examples

```bash
# Python roles, last 7 days
bun run .agents/skills/hirist-search/cli/src/cli.ts search -q "python developer" --jobage 7 --format table

# Java roles in Bangalore
bun run .agents/skills/hirist-search/cli/src/cli.ts search -q "java" -l "Bangalore" --format table

# Data science roles, top 5
bun run .agents/skills/hirist-search/cli/src/cli.ts search -q "data scientist" --limit 5 --format table

# DevOps roles in Pune, posted today
bun run .agents/skills/hirist-search/cli/src/cli.ts search -q "devops engineer" -l "Pune" --jobage 1 --format table

# Full details for a specific job
bun run .agents/skills/hirist-search/cli/src/cli.ts detail 1672163 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **`--query` is resolved, not sent as free text.** Hirist's own search API silently
  ignores free-text queries (confirmed by testing — every query string returned the same
  ~30k-job default set). This CLI instead resolves your query against Hirist's internal
  skill/role tag dictionary via its autosuggest endpoint, falling back through shorter
  word-prefixes and individual words if the full phrase doesn't match a tag directly (so
  `"senior python developer"` still finds the `Python` tag even though that exact phrase
  isn't one). If nothing resolves, the search returns zero results rather than erroring —
  this is common for non-IT roles, since Hirist's tag dictionary is tech-specific.
- **`--location` filters client-side, not server-side.** No working, documented
  location-name lookup was found on the portal (a numeric location-ID parameter exists
  and works, but there's no public way to resolve a city name to that ID). The CLI
  over-fetches for the resolved role/skill and then filters by city locally — it narrows
  what Hirist already returned rather than querying a location facet on the portal
  itself.
- Data is from Hirist's public API host (`gladiator.hirist.tech`) — no credentials
  required. `robots.txt` on `www.hirist.tech` has no bot-specific restrictions.
- `--jobage` maps to a confirmed-working `posting=<days>` parameter on the portal's own
  API.
- Job postings on Hirist are recruiter-driven and typically don't carry an application
  deadline or employment-type field — `detail` won't show ones that don't exist upstream.
- See `url-reference.md` for the full endpoint documentation, including exactly how the
  query-to-tag-ID resolution works and what was tried and ruled out for location
  filtering.
