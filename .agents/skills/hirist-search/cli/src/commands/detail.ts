import { apiFetchJSON, normalizeJob, stripHtml, writeError, type HiristRawJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw numeric ID or a hirist.tech job URL (/j/<slug>-<id>). */
export function normalizeId(input: string): string | null {
  const bare = input.trim().match(/^\d+$/)
  if (bare) return input.trim()
  const fromUrl = input.match(/\/j\/[a-z0-9-]*-(\d+)(?:[/?]|$)/i) || input.match(/\/j\/(\d+)(?:[/?]|$)/i)
  return fromUrl ? fromUrl[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }

  let raw: HiristRawJob & { introText?: string | null }
  try {
    const response = await apiFetchJSON<{ data: HiristRawJob & { introText?: string | null } }>("/job/detail", {
      jobcode: id,
    })
    if (!response || !response.data) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    raw = response.data
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Hirist returns HTTP 400 BadRequestError for a malformed/unknown jobcode, and a
    // 404-shaped JOB_NOT_FOUND body for a wrong param name - both mean "not found" here.
    if (message.includes("400") || message.includes("JOB_NOT_FOUND") || message.includes("BadRequestError")) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    writeError(message, "DETAIL_FAILED")
    return 1
  }

  const job = normalizeJob(raw)
  const description = raw.introText ? stripHtml(raw.introText) : null

  if (opts.format === "plain") {
    const lines = [
      job.title,
      `${job.company || "—"} · ${job.location || "—"}`,
      "",
      job.experienceMin !== null || job.experienceMax !== null
        ? `Experience: ${job.experienceMin ?? "?"}-${job.experienceMax ?? "?"} years`
        : "",
      job.tags.length > 0 ? `Skills: ${job.tags.join(", ")}` : "",
      job.companyRating !== null ? `Company rating: ${job.companyRating}/5` : "",
      "",
      description || "(no description)",
      "",
      `URL: ${job.url}`,
    ].filter((l) => l !== "")
    process.stdout.write(lines.join("\n") + "\n")
  } else {
    process.stdout.write(JSON.stringify({ ...job, description }, null, 2) + "\n")
  }
  return 0
}
