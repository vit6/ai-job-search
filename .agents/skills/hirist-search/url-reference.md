# Hirist.tech URL Reference

Public, unauthenticated JSON endpoints on `gladiator.hirist.tech` (Hirist's API host)
plus the public Next.js pages on `www.hirist.tech`. No login required for any of this.
Market: India, tech/IT roles only (Hirist positions itself as "India's #1 IT Job Portal" —
AI/ML, backend, devops, data, QA, mobile, etc.; not a general-purpose board).

## Important quirk: keyword search needs a numeric tag ID, not free text

The obvious endpoint, `GET /job/keyword/?query=<text>&keywordId=&...`, **silently ignores
`query` as free text** — every value (including gibberish) returns the same unfiltered
~30k-job default set. The only thing that actually filters results is `keywordId`, a
numeric tag ID from Hirist's internal skill/role taxonomy (e.g. `9` = Python, `5` = Java,
`2183` = Data Science). This was found by watching the live site's search-box network
traffic in a headless browser (Playwright) — the SSR HTML alone doesn't reveal it, and
several plausible-looking endpoints (`/job/tags?query=`, `/job/data/tag`) either 404 or
also ignore the query param and return a fixed default list. Confirmed genuine (not a
decoy) by checking that different `keywordId` values return different `totalJobs` counts
and different result sets.

So this skill's CLI resolves free text to a tag ID in two steps before searching:

**Step A — autosuggest (real text matching, confirmed working):**
```
GET https://gladiator.hirist.tech/job/search/keyword?query=<text>
```
Returns a plain JSON array of matching tag **names** (no IDs), prefix-matched against
Hirist's tag dictionary, e.g. `query=python` → `["Python", "Python Architect"]`. Empty
array `[]` means no matching tag — treat as a legitimate zero-result search, not an error.

**Step B — name to ID (via the tag's own landing page):**
```
GET https://www.hirist.tech/k/<slug>-jobs
```
where `<slug>` is the suggestion name lowercased with non-alphanumeric runs collapsed to
single hyphens (e.g. `"Data Scientist"` → `data-scientist-jobs`). The page is a Next.js
SSR page; its `<script id="__NEXT_DATA__">` JSON blob has `props.pageProps.tagId` — the
ID to use as `keywordId`. Note `tagId` is serialized as a **string** in some pages and
appears unquoted-looking in others when read carelessly — extract it with a regex that
tolerates both: `"tagId":"?(\d+)"?`. If a chosen suggestion's slug page 404s or has no
`tagId`, fall back to the next suggestion in the list; if none resolve, treat as zero
results.

Verified end-to-end for `python` (id 9), `Data Science` (id 2183), `Java` (id 5) — each
`keywordId` returns a distinct `totalJobs` count and distinct result set.

## Search

```
GET https://gladiator.hirist.tech/job/keyword/?query=<tagId>&page=<n>&industry=&keywordId=<tagId>&size=<n>&posting=<days>
```

| Param | Meaning | Notes |
|-------|---------|-------|
| `keywordId` | Resolved tag ID from Step B | The only thing that actually filters by role/skill |
| `query` | Ignored for filtering | The frontend also sends the tag ID here, redundantly; harmless to omit but sent for parity |
| `page` | **0-indexed** page number | CLI's `--page` is 1-indexed; subtract 1 before sending |
| `size` | Results per page | Frontend default is 20 |
| `posting` | Posting age in days | Confirmed working: `posting=1` → 56 results, `posting=7` → 493, `posting=30` → 1971, vs 8247 unfiltered (for keywordId=9 at recon time). Non-numeric values (`today`, `week`) are silently ignored — numeric days only. |
| `industry` | Industry filter | Present in the frontend's request shape; left empty (unresolved — no public industry-name-to-code lookup was found in this recon pass) |
| `loc` | Location filter | Accepts a **numeric** location ID (e.g. `loc=3` for Bangalore) and returns correctly filtered results; a **text** value (`loc=Bangalore`) causes the backend to 504 Gateway Timeout rather than erroring cleanly. No public name-to-ID lookup for locations was found (no `/job/data/location` or similar endpoint exists — confirmed 404). **Not used by this CLI** — `--location` is instead applied as a client-side filter on the `locations[].name` field of returned results (see below). |

Response shape:
```json
{
  "data": [ { "id": 1671998, "title": "...", "jobdesignation": "...", "min": 12, "max": 22,
              "createdTime": 1789583400000, "locations": [{"id":3,"name":"Bangalore"}],
              "tags": [{"id":..,"name":"Python","isMandatory":true}, ...],
              "companyData": {"companyId":21,"companyName":"...", "ambitionBoxInfo": {...}},
              ... }, ... ],
  "page": 0, "limit": 20, "count": 20, "totalJobs": 8247, "totalPages": 413, "hasMore": true
}
```

Because there is no reliable location-ID lookup, `--location` in this CLI over-fetches
(a larger `size`) and filters client-side by substring-matching the supplied text against
each result's `locations[].name`, then slices to `--limit`. This means `--location` narrows
what's already been fetched for the resolved tag rather than querying the portal's own
location facet — documented plainly in `SKILL.md` so users don't expect server-side
location filtering.

## Detail

```
GET https://gladiator.hirist.tech/job/detail?jobcode=<id>
```

Note the param name is **`jobcode`**, not `jobId`/`id`/`jobCode` — those all 404 with
`{"error":{"name":"JOB_NOT_FOUND",...}}`. An unknown/malformed ID (e.g. too large, or a
non-existent one) returns **HTTP 400** `{"error":{"name":"BadRequestError",...}}` — map
this (and the `JOB_NOT_FOUND` shape) to the CLI's `NOT_FOUND` code.

Response: `{"data": { ...same shape as a search item, plus... }}`
- `introText`: full HTML job description (needs entity-decoding + tag-stripping)
- `jobDetailUrl`: the canonical `https://www.hirist.tech/j/<slug>-<id>` URL — used verbatim
  for the `url` field instead of reconstructing it
- `companyData.ambitionBoxInfo`: company rating/review data from AmbitionBox
- No employment-type or application-deadline field exists anywhere in this payload — Hirist
  postings don't carry one (recruiter-driven, evergreen until manually closed); leave those
  `null` rather than guessing.

## Job detail page URL

`https://www.hirist.tech/j/<any-slug>-<id>` resolves correctly as long as the trailing
numeric ID matches — confirmed the slug text itself is not validated (`/j/anything-here-1671998`
and `/j/1671998` both return HTTP 200 for a real ID). The CLI still prefers `jobDetailUrl`
from the detail response when available, and falls back to `https://www.hirist.tech/j/<id>`
for search-result rows (which don't carry a slug).

## Access

- `robots.txt` (`https://www.hirist.tech/robots.txt`, served from `hirist.tech` after a
  301 from `hirist.com`) is a generic `User-agent: *` block disallowing only admin/media/
  install paths (`/components/`, `/admin/`, `/cache/`, etc.) plus `Crawl-delay: 10` — no
  bot-specific disallow, no block on `ClaudeBot`/`Claude-User`/any AI-crawler user agent.
- No login wall on search, category/tag pages, or the detail API.
- No Cloudflare managed-challenge or similar bot-check observed on `www.hirist.tech` or
  `gladiator.hirist.tech` (unlike its sister site instahyre.com, which sits behind one).

## Notes

- Hirist is IT/tech-specific — expect weak or no results for non-tech queries (e.g. no
  dedicated "Product Manager" tag was found; closest matches were "Product Design",
  "Product Analyst").
- `createdTime` is epoch milliseconds.
- Salary (`minSal`/`maxSal`) is almost always `0` with `hideSal: 1` — Hirist postings
  rarely disclose salary; not surfaced as a reliable field.
- Respect `Crawl-delay: 10` in spirit — this CLI is for interactive personal searches
  (a handful of requests per session), not bulk crawling.
