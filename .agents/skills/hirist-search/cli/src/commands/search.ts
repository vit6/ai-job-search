import { apiFetchJSON, normalizeJob, resolveTagId, writeError, type HiristRawJob, type NormalizedJob } from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface HiristSearchResponse {
  data: HiristRawJob[]
  page: number
  limit: number
  count: number
  totalJobs: number
  totalPages: number
  hasMore: boolean
}

function renderTable(jobs: NormalizedJob[]): string {
  if (jobs.length === 0) return "No results."
  const rows = jobs.map((j) => {
    const title = (j.title || "").slice(0, 42).padEnd(42)
    const company = (j.company || "—").slice(0, 26).padEnd(26)
    const loc = (j.location || "—").slice(0, 22).padEnd(22)
    const date = j.date || "—"
    return `${j.id.padEnd(9)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(9) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(jobs: NormalizedJob[]): string {
  return jobs
    .map(
      (j) =>
        `${j.title}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date || "—"}\n  id: ${j.id}\n  ${j.url}`,
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const resolved = await resolveTagId(opts.query)

    if (!resolved) {
      // No matching tag in Hirist's taxonomy - a legitimate zero-result search
      // (Hirist is IT/tech-specific; unrelated queries commonly have no tag at all),
      // not an error.
      const empty = { meta: { count: 0, page: opts.page, totalJobs: 0, totalPages: 0 }, results: [] as NormalizedJob[] }
      if (opts.format === "json") {
        process.stdout.write(JSON.stringify(empty, null, 2) + "\n")
      } else if (opts.format === "table") {
        process.stdout.write("No results.\n")
      } else {
        process.stdout.write("\n")
      }
      return 0
    }

    // With no server-side location facet available (see url-reference.md), over-fetch
    // when --location is set so client-side filtering still has enough to work with.
    const requestSize = opts.location ? Math.max(50, opts.limit ?? 20) : (opts.limit ?? 20)

    const params: Record<string, string> = {
      query: resolved.id,
      keywordId: resolved.id,
      industry: "",
      page: String(Math.max(0, opts.page - 1)),
      size: String(Math.min(requestSize, 100)),
    }
    if (opts.jobage !== undefined) params.posting = String(opts.jobage)

    const data = await apiFetchJSON<HiristSearchResponse>("/job/keyword/", params)
    let jobs = (data?.data ?? []).map(normalizeJob)

    if (opts.location) {
      const needle = opts.location.trim().toLowerCase()
      jobs = jobs.filter((j) => (j.location ?? "").toLowerCase().includes(needle))
    }

    const totalJobs = data?.totalJobs ?? jobs.length
    const totalPages = data?.totalPages ?? 1

    if (opts.limit !== undefined) jobs = jobs.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(jobs) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(jobs) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: jobs.length, page: opts.page, totalJobs, totalPages, resolvedTag: resolved.name },
            results: jobs,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
