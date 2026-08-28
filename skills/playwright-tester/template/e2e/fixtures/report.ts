import fs from "fs"
import path from "path"

// One row per iteration. Written as JSON (machine) + Markdown (human) at the
// END of the run, timestamped.
// Lesson: a report left over from a previous pass reads as a fresh result —
// always write to a timestamped file, never a fixed name alone.

export interface IterationRow {
  n: number
  pattern: string
  status: "PASS" | "FAIL" | "ERROR"
  edits: string[]
  diffs: { field: string; before: unknown; after: unknown }[]
  uiWipe?: boolean // typed value reverted in UI before submit
  error?: string
  durationMs: number
}

export class Report {
  private rows: IterationRow[] = []
  private startedAt = new Date().toISOString()

  add(row: IterationRow) {
    this.rows.push(row)
  }

  write(dir = "e2e/reports") {
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const passed = this.rows.filter((r) => r.status === "PASS").length
    const failed = this.rows.filter((r) => r.status === "FAIL").length
    const summary = {
      total: this.rows.length,
      passed,
      failed,
      uiWipes: this.rows.filter((r) => r.uiWipe).length,
    }
    const json = { startedAt: this.startedAt, summary, iterations: this.rows }
    fs.writeFileSync(path.join(dir, `report-${stamp}.json`), JSON.stringify(json, null, 2))
    const md = [
      `# E2E stress report`,
      `Started: ${this.startedAt} | ${passed}/${this.rows.length} passed | uiWipes: ${summary.uiWipes}`,
      "",
      "| # | pattern | status | uiWipe | failed fields | error |",
      "|---|---|---|---|---|---|",
      ...this.rows.map(
        (r) =>
          `| ${r.n} | ${r.pattern} | ${r.status} | ${r.uiWipe ?? ""} | ${r.diffs
            .map((d) => d.field)
            .join(", ")} | ${(r.error || "").slice(0, 80)} |`
      ),
    ].join("\n")
    fs.writeFileSync(path.join(dir, `report-${stamp}.md`), md)
    // Latest pointer (stable filename for tooling); content is stamped
    fs.writeFileSync(path.join(dir, "report-latest.json"), JSON.stringify(json, null, 2))
    console.log(`Report: ${dir}/report-${stamp}.md (${passed}/${this.rows.length} passed)`)
    return summary
  }
}
