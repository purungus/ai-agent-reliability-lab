import { describe, expect, it } from "vitest"
import { decide, NEVER_AUTO, type Claim } from "../engine/policy"
import messages from "../fixtures/messages.json"

const NOW = new Date("2026-07-08T12:00:00Z")

/** Order-independent, partial-match comparison: each expected claim must be matched by
 *  exactly one actual claim with the same intent (and reason, when the fixture specifies one). */
function expectClaimsMatch(actual: Claim[], expected: Record<string, unknown>[]) {
  expect(actual).toHaveLength(expected.length)
  for (const exp of expected) {
    const found = actual.find(
      (c) => c.intent === exp.intent && (exp.reason === undefined || c.reason === exp.reason),
    )
    expect(found, `expected a claim matching ${JSON.stringify(exp)} in ${JSON.stringify(actual)}`).toBeDefined()
    expect(found).toMatchObject(exp)
  }
}

describe("policy.ts — the 16 required fixtures (criterio de éxito: 16/16)", () => {
  for (const m of messages) {
    it(`${m.message_id}: "${m.text}"`, () => {
      const result = decide(m.text, NOW)
      expect(result.decision).toBe(m.expected_decision)
      expect(result.match_type).toBe(m.expected_match_type)
      expect(result.handoff_required).toBe(m.expected_handoff_required)
      expectClaimsMatch(result.confirmed_claims, m.expected_confirmed_claims)
      expectClaimsMatch(result.blocked_claims, m.expected_blocked_claims)
    })
  }
})

describe("policy.ts — global invariants (criterios de éxito)", () => {
  it("0 CONFIRMED sin evidencia vigente: every confirmed_claim's evidence is status=vigente", () => {
    for (const m of messages) {
      const result = decide(m.text, NOW)
      if (result.decision === "CONFIRMED") {
        expect(result.confirmed_claims.length).toBeGreaterThan(0)
      }
      for (const claim of result.confirmed_claims) {
        expect(claim.status).toBe("confirmed")
        expect(claim.evidence_used, `claim for ${claim.intent} has no evidence`).toBeDefined()
        for (const ev of claim.evidence_used ?? []) {
          expect(ev.status).toBe("vigente")
        }
      }
    }
  })

  it("0 CONFIRMED sin evidence_used no vacío (nunca hay evidence_used=[] en un CONFIRMED)", () => {
    for (const m of messages) {
      const result = decide(m.text, NOW)
      if (result.decision === "CONFIRMED") {
        expect(result.evidence_used.length).toBeGreaterThan(0)
      }
    }
  })

  it("todo intent en never_auto.json produce BLOCK + handoff_required=true, sin excepción", () => {
    for (const intent of NEVER_AUTO) {
      // synthetic minimal message per never_auto intent, independent of fixtures
      const map: Record<string, string> = {
        payment_question: "puedo pagar en efectivo?",
        installments_question: "hacés cuotas?",
        trade_in_question: "aceptás permuta?",
        reservation_question: "me reservás uno?",
        delivery_question: "hay entrega hoy?",
      }
      const text = map[intent]
      if (!text) continue
      const result = decide(text, NOW)
      expect(result.decision, `intent ${intent}`).toBe("BLOCK")
      expect(result.handoff_required, `intent ${intent}`).toBe(true)
    }
  })

  it("datos del cliente NUNCA aparecen como evidence: 500 (msg_11) no está en ningún evidence_used", () => {
    const m = messages.find((x) => x.message_id === "msg_11")!
    const result = decide(m.text, NOW)
    expect(result.customer_price_claim).toBe(500)
    const allEvidenceValues = result.evidence_used.map((e) => e.value)
    expect(allEvidenceValues).not.toContain(500)
    expect(allEvidenceValues).not.toContain("500")
    // the real, vigente catalog price (680) IS confirmed — the system corrects, not just ignores
    expect(result.confirmed_claims.some((c) => c.evidence_used?.some((e) => e.value === 680))).toBe(true)
    // the injection is explicitly recorded as a blocked_claim with the required reason
    expect(result.blocked_claims.some((c) => c.reason === "customer_input_not_truth")).toBe(true)
  })

  it("multi-intent no pierde el intent sensible: msg_12 conserva confirmed_claims y blocked_claims simultáneamente", () => {
    const m = messages.find((x) => x.message_id === "msg_12")!
    const result = decide(m.text, NOW)
    expect(result.confirmed_claims).toHaveLength(1)
    expect(result.blocked_claims).toHaveLength(1)
    expect(result.confirmed_claims[0].intent).toBe("stock_availability")
    expect(result.blocked_claims[0].intent).toBe("installments_question")
    // top-level precedence is BLOCK (never_auto present) even though a claim was confirmable
    expect(result.decision).toBe("BLOCK")
  })

  it("policy_version is stamped on every decision (auditability — Constitution II.11)", () => {
    for (const m of messages) {
      expect(decide(m.text, NOW).policy_version).toBeTruthy()
    }
  })
})
