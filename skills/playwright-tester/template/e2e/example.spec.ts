import { test, expect } from "@playwright/test"
import { getAppPage } from "./fixtures/cdp"
import { apiGet, parseBlob, diffRec, type Rec } from "./fixtures/api"
import { Report } from "./fixtures/report"

// Template: baseline → mutate → save → refetch → crosscheck untouched fields
// → UI-wipe check. Copy, then adapt the ADAPT markers (selectors, endpoints).

const ITERATIONS = Number(process.env.E2E_ITERATIONS || 1)

test.describe.configure({ mode: "serial" })

test("update crosscheck — untouched fields survive", async ({ }, testInfo) => {
  const page = await getAppPage()
  const report = new Report()

  for (let i = 1; i <= ITERATIONS; i++) {
    const t0 = Date.now()
    const pattern = i % 2 === 1 ? "no-edit-save" : "single-field-edit"
    try {
      // 1. Reconnaissance before action: wait for network, then pick selectors
      await page.waitForLoadState("networkidle")
      // ADAPT: selectors discovered from rendered DOM (see SKILL.md)
      const modal = page.locator('[role="dialog"]')

      // 2. Baseline via the app's own API from the connected tab
      // ADAPT: endpoint returning the record under test
      const { body } = await apiGet(page, "/api/items/current")
      const before: Rec = parseBlob(body)

      // 3. Mutate per pattern (drive the UI like a real user)
      const edits: string[] = []
      if (pattern === "single-field-edit") {
        await page.getByLabel("Name").fill(`E2E-${Date.now()}`)
        edits.push("name")
      }

      // 4. UI-wipe check: form must still show what was typed right before save
      //    (catches async re-seed races that silently revert edits)
      if (edits.includes("name")) {
        const shown = await page.getByLabel("Name").inputValue()
        if (!shown.startsWith("E2E-")) {
          report.add({
            n: i, pattern, status: "FAIL", edits, diffs: [],
            uiWipe: true, durationMs: Date.now() - t0,
          })
          continue
        }
      }

      // 5. Save
      await page.getByRole("button", { name: /save|update/i }).click()
      await expect(modal).toBeHidden()

      // 6. Crosscheck: refetch; every field NOT edited must equal baseline
      const after = parseBlob((await apiGet(page, "/api/items/current")).body)
      const diffs = diffRec(before, after, [
        ...edits,
        "updatedAt", // ADAPT: server-managed fields
      ])

      report.add({
        n: i, pattern, status: diffs.length ? "FAIL" : "PASS",
        edits, diffs, durationMs: Date.now() - t0,
      })
      if (diffs.length) {
        await page.screenshot({
          path: `e2e/reports/iter-${i}-fail.png`, fullPage: true,
        })
      }
    } catch (e) {
      report.add({
        n: i, pattern, status: "ERROR", edits: [], diffs: [],
        error: String(e).slice(0, 300), durationMs: Date.now() - t0,
      })
    }
  }

  const summary = report.write()
  expect(summary.failed + (summary.total - summary.passed - summary.failed), "failures")
    .toBe(0)
})
