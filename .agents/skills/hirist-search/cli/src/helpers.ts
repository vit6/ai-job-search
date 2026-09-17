// Data source: Hirist.tech's public API host (gladiator.hirist.tech) plus its public
// Next.js pages (www.hirist.tech). No authentication required. See ../url-reference.md
// for the full recon notes, especially the keyword-to-tag-ID resolution this file
// implements: the portal's own `query` param on the search endpoint is a decoy that
// never filters — only a numeric `keywordId` (an internal tag ID) actually works, and
// there is no direct "resolve this text to an ID" endpoint, so we resolve it ourselves
// via the autosuggest endpoint plus the tag's own landing page.

export const API_BASE = "https://gladiator.hirist.tech"
export const PORTAL_BASE = "https://www.hirist.tech"
const UA = "Mozilla/5.0 (compatible; hirist-search-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch with exponential backoff on 429/5xx. Returns null on a 404. Throws on other errors. */
async function fetchWithBackoff(url: string, accept: string): Promise<Response | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    return response
  }
  throw new Error("Request failed after max retries")
}

/** GET a JSON endpoint under API_BASE. Returns null on 404. Throws (with the API's own
 * error message where available) on 400 and other non-2xx statuses. */
export async function apiFetchJSON<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  let url = `${API_BASE}${path}`
  if (params && Object.keys(params).length > 0) {
    url += `?${new URLSearchParams(params).toString()}`
  }
  const response = await fetchWithBackoff(url, "application/json")
  if (response === null) return null
  const body = await response.text()
  let parsed: unknown
  try {
    parsed = body ? JSON.parse(body) : null
  } catch {
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    throw new Error("Response was not valid JSON")
  }
  if (!response.ok) {
    const apiMessage =
      parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
        ? (parsed as { error?: { message?: string; name?: string } }).error
        : undefined
    throw new Error(
      `API request failed: ${response.status} ${apiMessage?.name ?? ""} ${apiMessage?.message ?? response.statusText}`.trim(),
    )
  }
  return parsed as T
}

/** GET an HTML page (used only for tag-ID resolution against www.hirist.tech). Returns null on 404. */
export async function htmlFetch(url: string): Promise<string | null> {
  const response = await fetchWithBackoff(url, "text/html,application/xhtml+xml")
  if (response === null) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return response.text()
}

/** Lowercase, collapse non-alphanumeric runs to single hyphens, trim edge hyphens. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Resolve free-text keywords to a Hirist tag ID.
 *
 * Two-step process (see url-reference.md):
 *  1. /job/search/keyword?query=<text> — real prefix-matched autosuggest, returns tag
 *     NAMES only (no IDs). Empty array means no matching tag.
 *  2. For each candidate name (exact case-insensitive match first, then in the order
 *     returned), fetch that tag's own landing page (/k/<slug>-jobs) and pull `tagId`
 *     out of its embedded __NEXT_DATA__ blob. Try up to the first 3 candidates in case
 *     a slug page is missing or malformed; return null if none resolve.
 */
/**
 * The autosuggest endpoint does a strict prefix match against Hirist's tag dictionary
 * (skills like "Python", "Data Analyst"), not a fuzzy or word-order-independent search -
 * "python developer" matches nothing because no tag starts with that exact string, even
 * though "python" alone matches "Python". Build a list of fallback strings to try, in
 * order: the full query, then progressively shorter word-prefixes of it, then each
 * individual word - so "senior python developer in Pune" still finds "Python".
 */
export function queryFallbacks(query: string): string[] {
  const trimmed = query.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const candidates: string[] = [trimmed]
  for (let i = words.length - 1; i >= 1; i--) candidates.push(words.slice(0, i).join(" "))
  for (const w of words) candidates.push(w)
  // Dedupe, preserving first occurrence, and cap how many round trips a single
  // resolution can cost.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const c of candidates) {
    const key = c.toLowerCase()
    if (!c || seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }
  return deduped.slice(0, 5)
}

export async function resolveTagId(query: string): Promise<{ id: string; name: string } | null> {
  for (const candidate of queryFallbacks(query)) {
    const suggestions = await apiFetchJSON<string[]>("/job/search/keyword", { query: candidate })
    if (!suggestions || suggestions.length === 0) continue

    const exact = suggestions.find((s) => s.toLowerCase() === candidate.toLowerCase())
    const ordered = exact ? [exact, ...suggestions.filter((s) => s !== exact)] : suggestions

    for (const name of ordered.slice(0, 3)) {
      const slug = slugify(name)
      if (!slug) continue
      const html = await htmlFetch(`${PORTAL_BASE}/k/${slug}-jobs`)
      if (!html) continue
      // tagId is serialized as a JSON string on some pages ("tagId":"5") and appears
      // unquoted on others ("tagId":9) - tolerate both forms.
      const m = html.match(/"tagId":"?(\d+)"?/)
      if (m) return { id: m[1], name }
    }
  }
  return null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Strip HTML tags from a description, keeping paragraph/line breaks as newlines. */
export function stripHtml(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim()
}

export interface HiristRawJob {
  id: number
  title: string
  jobdesignation?: string | null
  min?: number | null
  max?: number | null
  createdTime?: number | null
  locations?: Array<{ id: number; name: string }> | null
  tags?: Array<{ id: number; name: string; isMandatory?: boolean }> | null
  companyData?: {
    companyId?: number
    companyName?: string | null
    ambitionBoxInfo?: { aggregateRating?: number | null } | null
  } | null
  jobDetailUrl?: string | null
  introText?: string | null
}

export interface NormalizedJob {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  experienceMin: number | null
  experienceMax: number | null
  tags: string[]
  companyRating: number | null
}

/** Map a raw Hirist job (from search or detail) to the portal-skill contract's output shape. */
export function normalizeJob(raw: HiristRawJob): NormalizedJob {
  const title = (raw.title ?? "").trim() || (raw.jobdesignation ?? "").trim() || "(untitled)"
  const date = raw.createdTime ? new Date(raw.createdTime).toISOString().slice(0, 10) : null
  const location = raw.locations && raw.locations.length > 0 ? raw.locations.map((l) => l.name).join(", ") : null
  return {
    id: String(raw.id),
    title,
    company: raw.companyData?.companyName ?? null,
    location,
    date,
    url: raw.jobDetailUrl ?? `${PORTAL_BASE}/j/${raw.id}`,
    experienceMin: raw.min ?? null,
    experienceMax: raw.max ?? null,
    tags: (raw.tags ?? []).map((t) => t.name),
    companyRating: raw.companyData?.ambitionBoxInfo?.aggregateRating ?? null,
  }
}
