// Truth Layer — Revenue OS Demo v0
//
// Constitutional invariants this module enforces (see docs/13-REVENUE-OS-CONSTITUTION.md):
//   II.4 — every critical datum has owner, source, approval and validity.
//   III.2 — without owner or source, a datum is never eligible.
//   III.2 — status is DERIVED, never hand-written.
//   III.2 — the conversation cannot write the source of truth (see extract.ts / policy.ts:
//           this module only ever reads from products.json, never from parsed message text).
//
// This module owns product matching and ambiguity classification (not extract.ts), per the
// closed decision: "ambiguity = more than one candidate matches the given constraints."

import productsData from "../data/products.json"

export type Condition = "Nuevo" | "Usado"
export type StockStatus = "available" | "unavailable" | "unknown"

export type Product = {
  product_id: string
  brand: string
  model: string
  storage: string
  color: string
  condition: Condition
  stock_status: StockStatus
  price: number
  currency: string
  stock_verified_at: string
  stock_valid_until: string
  price_verified_at: string
  price_valid_until: string
  owner: string
  source: string
  notes: string
}

export type EntityQuery = {
  brand?: string
  model?: string
  storage?: string
  color?: string
  condition?: string
}

export type FreshnessField = "stock" | "price"
export type FieldStatus = "vigente" | "vencido" | "desconocido"
export type MatchType = "exact" | "ambiguous" | "not_found"

export type EvidenceRef = {
  field: "stock_status" | "price"
  value: unknown
  source: string
  owner: string
  verified_at: string
  valid_until: string
  status: FieldStatus
}

const norm = (s: string) => s.trim().toLowerCase()

/** All products from the source of truth. Never mutated. */
export function loadProducts(): Product[] {
  return productsData as Product[]
}

/**
 * Filters the catalog by every constraint present in the query (AND semantics).
 * Unspecified fields do not filter. Case-insensitive exact match per field —
 * NOT substring matching, so "iPhone 13" never matches "iPhone 13 Pro Max".
 */
export function findCandidates(query: EntityQuery, products: Product[] = loadProducts()): Product[] {
  return products.filter((p) => {
    if (query.brand && norm(p.brand) !== norm(query.brand)) return false
    if (query.model && norm(p.model) !== norm(query.model)) return false
    if (query.storage && norm(p.storage) !== norm(query.storage)) return false
    if (query.color && norm(p.color) !== norm(query.color)) return false
    if (query.condition && norm(p.condition) !== norm(query.condition)) return false
    return true
  })
}

/** exact = exactly 1 candidate · ambiguous = >1 · not_found = 0. */
export function classifyMatch(candidates: Product[]): MatchType {
  if (candidates.length === 0) return "not_found"
  if (candidates.length === 1) return "exact"
  return "ambiguous"
}

function parseDate(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Derives freshness status for a single field of a single product. Never hand-written —
 * this is the ONLY place derived_status/policy_eligibility logic lives (III.2).
 *
 * Rules, in order:
 *  1. stock field with stock_status === "unknown" → desconocido, regardless of dates.
 *  2. owner or source missing/empty → desconocido (II.4 / III.2: no owner/source = not eligible).
 *  3. verified_at or valid_until missing/unparseable → desconocido.
 *  4. now > valid_until → vencido.
 *  5. otherwise → vigente.
 */
export function deriveFieldStatus(product: Product, field: FreshnessField, now: Date): FieldStatus {
  if (field === "stock" && product.stock_status === "unknown") return "desconocido"
  if (!product.owner.trim() || !product.source.trim()) return "desconocido"

  const verifiedAtRaw = field === "stock" ? product.stock_verified_at : product.price_verified_at
  const validUntilRaw = field === "stock" ? product.stock_valid_until : product.price_valid_until
  const verifiedAt = parseDate(verifiedAtRaw)
  const validUntil = parseDate(validUntilRaw)
  if (!verifiedAt || !validUntil) return "desconocido"

  if (now.getTime() > validUntil.getTime()) return "vencido"
  return "vigente"
}

export function isFieldEligible(product: Product, field: FreshnessField, now: Date): boolean {
  return deriveFieldStatus(product, field, now) === "vigente"
}

/** Builds the EvidenceRef for a field — always reflects the DERIVED status, never asserted. */
export function buildEvidence(product: Product, field: FreshnessField, now: Date): EvidenceRef {
  const status = deriveFieldStatus(product, field, now)
  if (field === "stock") {
    return {
      field: "stock_status",
      value: product.stock_status,
      source: product.source,
      owner: product.owner,
      verified_at: product.stock_verified_at,
      valid_until: product.stock_valid_until,
      status,
    }
  }
  return {
    field: "price",
    value: product.price,
    source: product.source,
    owner: product.owner,
    verified_at: product.price_verified_at,
    valid_until: product.price_valid_until,
    status,
  }
}
