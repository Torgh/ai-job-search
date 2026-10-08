import { describe, test, expect } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

// Live smoke query registered with the skill (see SKILL.md). Keep volume low:
// one search and one detail per live run.
const SMOKE_ARGS: string[] = ["-q","księgowa","-l","Warszawa"]

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr)
  } catch {
    return {}
  }
}

describe("flag validation (network-free)", () => {
  test("a bogus --flag exits 1 with UNKNOWN_FLAG on stderr", async () => {
    const r = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    const err = parsedStderr(r.stderr)
    expect(err.code).toBe("UNKNOWN_FLAG")
    expect(err.error).toContain("--bogus-flag")
  })

  for (const name of ["jobage", "page", "limit"]) {
    test(`--${name} 1.5 exits 1 with BAD_ARG instead of truncating`, async () => {
      const r = await runCLI(["search", "-q", "test", `--${name}`, "1.5"])
      expect(r.exitCode).toBe(1)
      expect(parsedStderr(r.stderr).code).toBe("BAD_ARG")
    })
    test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
      const r = await runCLI(["search", "-q", "test", `--${name}`, "0"])
      expect(r.exitCode).toBe(1)
      expect(parsedStderr(r.stderr).code).toBe("BAD_ARG")
    })
  }

  test("detail without an id exits 1 with NO_ID", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(parsedStderr(r.stderr).code).toBe("NO_ID")
  })

  test("detail rejects a URL on a foreign host with BAD_ID", async () => {
    const r = await runCLI(["detail", "https://boards.greenhouse.io/acme/jobs/123456789"])
    expect(r.exitCode).toBe(1)
    expect(parsedStderr(r.stderr).code).toBe("BAD_ID")
  })

  test("unknown command exits 1 with BAD_CMD", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(parsedStderr(r.stderr).code).toBe("BAD_CMD")
  })
})

// CI deliberately makes no live portal requests (CONTRIBUTING.md), so the smoke
// test only runs when LIVE=1 is set: `bun run test:live`.
describe("live smoke test", () => {
  test.skipIf(!process.env.LIVE)("search returns real results and detail returns readable text", async () => {
    const r = await runCLI(["search", ...SMOKE_ARGS, "--limit", "5"])
    const out = parseJSON<{ meta: { count: number }; results: any[] }>(r)
    expect(out.results.length).toBeGreaterThan(0)
    for (const job of out.results) {
      expect(job.id).toBeTruthy()
      expect(job.title).toBeTruthy()
      expect(job.url).toMatch(/^https:\/\//)
      for (const k of ["company", "location", "date"]) expect(k in job).toBe(true)
      expect(job.title).not.toMatch(/<[a-z]|&amp;|&quot;/i)
    }
    const d = await runCLI(["detail", out.results[0].id])
    const job = parseJSON<{ title: string; description: string | null }>(d)
    expect(job.title).toBeTruthy()
    expect((job.description || "").length).toBeGreaterThan(40)
    expect(job.description).not.toMatch(/<\/?(p|div|li|span)\b/i)
  })
})
