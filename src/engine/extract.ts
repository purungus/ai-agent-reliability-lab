// Intent + entity extraction — Revenue OS Demo v0
//
// Deterministic, keyword/regex-based. No LLM. This is a deliberate v0 architecture choice
// (see the approved spec): for a closed, curated fixture set over a small known catalog,
// a deterministic extractor is more reliable, cheaper, and more testable than an LLM call —
// and it proves the thesis harder ("this works even without an LLM guessing").
//
// Constitutional invariant this module enforces (II.5 — "the conversation cannot write the
// source of truth"): this module NEVER looks anything up in products.json. It only reads the
// raw message text. If the customer states a price/stock claim, it is surfaced as
// `customer_price_claim` (a flagged, non-authoritative observation) — never as a matchable
// entity, and never fed into truth.ts. policy.ts is responsible for turning that flag into an
// explicit blocked_claim; this module's job stops at "here is what the customer said."
//
// Ambiguity classification does NOT live here (see truth.ts) — this module only extracts
// entities; truth.ts decides exact/ambiguous/not_found from them.

import type { EntityQuery } from "./truth"

export type Intent =
  | "stock_availability"
  | "price_question"
  | "catalog_question"
  | "delivery_question"
  | "payment_question"
  | "installments_question"
  | "trade_in_question"
  | "reservation_question"
  | "unknown"

export type ExtractResult = {
  intents: Intent[]
  entities: EntityQuery
  /**
   * A price-like number the customer stated in the message, present ONLY when it could not
   * be explained by an already-extracted storage/model token. Never used as evidence — see
   * policy.ts, which must record it as a blocked_claim (reason: "customer_input_not_truth")
   * and must never let it appear in any EvidenceRef.
   */
  customer_price_claim?: number
}

const APPLE_MODEL_NUMBERS = ["11", "12", "13", "14", "15", "16"]
const STORAGE_SIZES = ["64", "128", "256", "512"]
const COLORS: Record<string, string> = { azul: "Azul", negro: "Negro", blanco: "Blanco", grafito: "Grafito" }

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "cuánto" -> "cuanto"
}

function extractModel(t: string): string | undefined {
  const numAlt = APPLE_MODEL_NUMBERS.join("|")
  const proMax = t.match(new RegExp(`\\b(${numAlt})\\s*pro\\s*max\\b`))
  if (proMax) return `iPhone ${proMax[1]} Pro Max`

  const pro = t.match(new RegExp(`\\b(${numAlt})\\s*pro\\b`))
  if (pro) return `iPhone ${pro[1]} Pro`

  if (/\biphone\s*se\b/.test(t)) return "iPhone SE"

  const bare = t.match(new RegExp(`\\b(${numAlt})\\b`))
  if (bare) return `iPhone ${bare[1]}`

  const samsung = t.match(/\bs(\d{2})\s*ultra\b/)
  if (samsung) return `S${samsung[1]} Ultra`

  return undefined
}

function extractStorage(t: string): string | undefined {
  const m = t.match(new RegExp(`\\b(${STORAGE_SIZES.join("|")})\\s*(gb)?\\b`))
  return m ? `${m[1]}GB` : undefined
}

function extractColor(t: string): string | undefined {
  for (const [key, canonical] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${key}\\b`).test(t)) return canonical
  }
  return undefined
}

function extractCondition(t: string): string | undefined {
  if (/\busad[oa]s?\b/.test(t)) return "Usado"
  if (/\bnuevos?\b/.test(t)) return "Nuevo"
  return undefined
}

function extractBrand(t: string, modelFound?: string): string | undefined {
  if (/\bsamsung\b/.test(t)) return "Samsung"
  if (/\biphone\b/.test(t)) return "Apple"
  if (modelFound?.startsWith("iPhone")) return "Apple" // inferred even without the literal word "iphone"
  if (modelFound?.startsWith("S")) return "Samsung"
  return undefined
}

function extractEntities(t: string): EntityQuery {
  const model = extractModel(t)
  const entities: EntityQuery = {}
  const brand = extractBrand(t, model)
  if (brand) entities.brand = brand
  if (model) entities.model = model
  const storage = extractStorage(t)
  if (storage) entities.storage = storage
  const color = extractColor(t)
  if (color) entities.color = color
  const condition = extractCondition(t)
  if (condition) entities.condition = condition
  return entities
}

function detectIntents(t: string, entities: EntityQuery): Intent[] {
  const found: Intent[] = []

  if (/precio|cuanto|\bvale\b|\bsale\b|cuesta|confirm/.test(t)) found.push("price_question")
  if (/catalogo/.test(t)) found.push("catalog_question")
  if (/entrega|envio|delivery|retiro/.test(t)) found.push("delivery_question")
  if (/cuota/.test(t)) found.push("installments_question")
  if (/permuta|trade.?in/.test(t)) found.push("trade_in_question")
  if (/reserv/.test(t)) found.push("reservation_question")
  if (/efectivo|transferencia|\bpago\b/.test(t)) found.push("payment_question")

  // stock_availability is gated on having extracted an actual product entity — this is what
  // stops "Tenés entrega hoy?" (a delivery question that happens to contain "tenés") from
  // also firing stock_availability: no product entity, no stock claim.
  const hasEntity = Boolean(entities.brand || entities.model || entities.storage || entities.color)
  if (/\b(tenes|tenés|hay|tienen)\b/.test(t) && hasEntity) found.push("stock_availability")

  if (found.length === 0) found.push("unknown")
  return found
}

/**
 * Finds a price-like number the customer stated that is NOT explained by an already-extracted
 * model/storage token. Only runs when price_question fired, to stay conservative and precise —
 * this is deliberately narrow (see the injection fixture, msg_11) rather than a general-purpose
 * price parser.
 */
function extractCustomerPriceClaim(t: string, intents: Intent[], entities: EntityQuery): number | undefined {
  if (!intents.includes("price_question")) return undefined
  const consumed = new Set(
    [entities.storage?.replace("GB", ""), entities.model?.match(/\d+/)?.[0]].filter(Boolean),
  )
  const numbers = t.match(/\b\d{2,4}\b/g) ?? []
  for (const n of numbers) {
    if (!consumed.has(n)) return Number(n)
  }
  return undefined
}

export function extract(text: string): ExtractResult {
  const t = normalize(text)
  const entities = extractEntities(t)
  const intents = detectIntents(t, entities)
  const customer_price_claim = extractCustomerPriceClaim(t, intents, entities)
  return customer_price_claim === undefined ? { intents, entities } : { intents, entities, customer_price_claim }
}
