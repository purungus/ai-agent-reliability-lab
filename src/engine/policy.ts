// Policy Engine — Revenue OS Demo v0
//
// Pure, deterministic function: text + now -> PolicyResult. No LLM inside this module — the
// LLM (if ever enabled) only runs in extract.ts (understanding) or respond.ts (drafting), never
// here (Constitution II.2: "the LLM understands and drafts; it never decides").
//
// Closed decisions this file implements exactly as approved:
//  A. `HANDOFF` stays declared in the Decision type for parity with the Constitution (III.3),
//     but v0's rules never produce it — never_auto claims use BLOCK + handoff_required=true.
//  B. Ambiguity = more than one candidate matches the given constraints (see truth.ts).
//  C. Top-level decision precedence: BLOCK > SAFE_PARTIAL > CONFIRMED. BLOCK fires only when an
//     intent is a member of never_auto.json — NOT merely because some blocked_claim exists
//     (an expired/unknown-evidence claim is SAFE_PARTIAL, not BLOCK). confirmed_claims and
//     blocked_claims are always both populated when applicable, independent of which one wins
//     top-level precedence (multi-intent must not lose the confirmable part).
//  D/E. Fixtures 14-16 (stock/price vencido, stock unknown) and fixture 11 (conversational
//     injection) are implemented below exactly per the approved policy matrix.

import { extract, type Intent } from "./extract"
import {
  buildEvidence,
  classifyMatch,
  findCandidates,
  type EntityQuery,
  type EvidenceRef,
  type FreshnessField,
  type MatchType,
} from "./truth"
import neverAutoData from "../data/never_auto.json"

export const NEVER_AUTO: Intent[] = neverAutoData as Intent[]
export const POLICY_VERSION = "policy-v0.1.0"

export type Decision = "CONFIRMED" | "SAFE_PARTIAL" | "HANDOFF" | "BLOCK"
export type ClaimStatus = "confirmed" | "blocked"

export type Claim = {
  intent: Intent
  product_id?: string
  attribute?: FreshnessField
  status: ClaimStatus
  evidence_used?: EvidenceRef[]
  reason?: string
}

export type PolicyResult = {
  detected_intents: Intent[]
  detected_entities: EntityQuery
  match_type: MatchType | "not_required"
  matched_products: string[]
  missing_attributes: string[]
  decision: Decision
  handoff_required: boolean
  evidence_used: EvidenceRef[]
  confirmed_claims: Claim[]
  blocked_claims: Claim[]
  policy_version: string
  /** Audit-only: a price the customer stated in the message text. NEVER present in
   *  evidence_used and NEVER used to decide any claim — see extract.ts / II.5. */
  customer_price_claim?: number
}

const PRODUCT_INTENTS: Intent[] = ["stock_availability", "price_question"]
const attributeFor = (intent: Intent): FreshnessField => (intent === "stock_availability" ? "stock" : "price")

export function decide(text: string, now: Date, neverAuto: Intent[] = NEVER_AUTO): PolicyResult {
  const { intents, entities, customer_price_claim } = extract(text)
  const productIntents = intents.filter((i) => PRODUCT_INTENTS.includes(i))

  let match_type: MatchType | "not_required" = "not_required"
  let matched_products: string[] = []
  const missing_attributes: string[] = []
  const confirmed_claims: Claim[] = []
  const blocked_claims: Claim[] = []
  const evidence_used: EvidenceRef[] = []
  let anyAttributeClaimBlocked = false

  if (productIntents.length > 0) {
    const candidates = findCandidates(entities)
    match_type = classifyMatch(candidates)
    matched_products = candidates.map((p) => p.product_id)

    if (match_type === "ambiguous") {
      if (!entities.storage) missing_attributes.push("storage")
      if (!entities.color) missing_attributes.push("color")
    }

    if (match_type === "exact") {
      const product = candidates[0]
      for (const intent of productIntents) {
        const attribute = attributeFor(intent)
        const evidence = buildEvidence(product, attribute, now)
        evidence_used.push(evidence)
        if (evidence.status === "vigente") {
          confirmed_claims.push({
            intent,
            product_id: product.product_id,
            attribute,
            status: "confirmed",
            evidence_used: [evidence],
          })
        } else {
          anyAttributeClaimBlocked = true
          const reasonSuffix = evidence.status === "vencido" ? "vencido" : "unknown"
          blocked_claims.push({
            intent,
            product_id: product.product_id,
            attribute,
            status: "blocked",
            evidence_used: [evidence],
            reason: `${attribute}_${reasonSuffix}`,
          })
        }
      }
    }
  }

  // never_auto claims: always blocked, independent of product matching (II.13/Constitution IV.4).
  const neverAutoIntentsPresent = intents.filter((i) => neverAuto.includes(i))
  for (const intent of neverAutoIntentsPresent) {
    blocked_claims.push({ intent, status: "blocked" })
  }

  // Conversational injection guard (closed decision E). This claim documents that the
  // customer's stated price was seen and explicitly NOT trusted. It never touches
  // evidence_used and never participates in top-level precedence.
  if (customer_price_claim !== undefined) {
    blocked_claims.push({
      intent: "price_question",
      product_id: matched_products.length === 1 ? matched_products[0] : undefined,
      status: "blocked",
      reason: "customer_input_not_truth",
    })
  }

  const hasUnknown = intents.includes("unknown")
  const hasCatalog = intents.includes("catalog_question")

  let decision: Decision
  if (neverAutoIntentsPresent.length > 0) {
    decision = "BLOCK"
  } else if (anyAttributeClaimBlocked || match_type === "ambiguous" || match_type === "not_found" || hasUnknown || hasCatalog) {
    decision = "SAFE_PARTIAL"
  } else {
    decision = "CONFIRMED"
  }

  const handoff_required = neverAutoIntentsPresent.length > 0 || anyAttributeClaimBlocked || hasUnknown

  return {
    detected_intents: intents,
    detected_entities: entities,
    match_type,
    matched_products,
    missing_attributes,
    decision,
    handoff_required,
    evidence_used,
    confirmed_claims,
    blocked_claims,
    policy_version: POLICY_VERSION,
    ...(customer_price_claim === undefined ? {} : { customer_price_claim }),
  }
}
