// Event Ledger — Revenue OS Demo v0
//
// Append-only, in-memory (Constitution II.11: "the ledger is append-only and every decision
// must be explainable"). No DB in v0 (approved decision) — export to JSON is the persistence
// story for this phase.
//
// This module also owns the top-level orchestration (extract -> truth -> policy -> respond ->
// ledger) via `runMessage`, since the ledger is the natural terminal step of the pipeline
// described in the approved spec's flow diagram, and no dedicated orchestrator file exists in
// the approved file list.
//
// The ledger entry snapshots the evidence AT THE MOMENT `now` was passed in — re-running the
// same message later (with a later `now`, or after products.json changes) can legitimately
// produce a different decision; the old ledger entry still explains what was true when it ran.

import { decide, type PolicyResult } from "./policy"
import { buildResponse } from "./respond"

export type LedgerEntry = PolicyResult & {
  decision_id: string
  timestamp: string
  input_text: string
  allowed_response: string
}

const ledger: LedgerEntry[] = []

/** Runs one message through the full pipeline and appends the result to the ledger. */
export function runMessage(text: string, now: Date = new Date()): LedgerEntry {
  const result = decide(text, now)
  const allowed_response = buildResponse(result)
  const entry: LedgerEntry = {
    ...result,
    decision_id: crypto.randomUUID(),
    timestamp: now.toISOString(),
    input_text: text,
    allowed_response,
  }
  ledger.push(entry)
  return entry
}

/** Read-only snapshot — callers cannot mutate the underlying ledger array. */
export function getLedger(): readonly LedgerEntry[] {
  return [...ledger]
}

/** Clears the in-memory ledger (used by the UI before a fresh batch run). */
export function clearLedger(): void {
  ledger.length = 0
}

export function exportLedgerAsJson(): string {
  return JSON.stringify(ledger, null, 2)
}

/** Browser-only: triggers a download of the current ledger as a .json file. */
export function downloadLedgerJson(filename = `revenue-os-ledger-${Date.now()}.json`): void {
  const blob = new Blob([exportLedgerAsJson()], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
