import { CliError, normalizeId, portalDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  // normalizeId rejects URLs on any other host: an apply link from a posting
  // (Greenhouse, Lever, ...) must not be read as an ID on this portal.
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}" (expected an ID from search results or a URL on this portal)`, "BAD_ID")
    return 1
  }
  try {
    const job = await portalDetail(id)
    if (!job) {
      writeError("Job not found (expired, removed, or the ID is wrong)", "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      const facts = [
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
      ].filter(Boolean)
      const blocks = [
        `${job.title}\n${job.company || "—"} · ${job.location || "—"}`,
        facts.join("\n"),
        job.description || "(no description)",
        `URL: ${job.url}`,
      ].filter(Boolean)
      process.stdout.write(blocks.join("\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    if (e instanceof CliError) {
      writeError(e.message, e.code)
      return 1
    }
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
