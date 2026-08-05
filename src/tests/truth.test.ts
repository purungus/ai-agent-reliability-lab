import { describe, expect, it } from "vitest"
import {
  buildEvidence,
  classifyMatch,
  deriveFieldStatus,
  findCandidates,
  loadProducts,
  type Product,
} from "../engine/truth"

// Fixed reference "now" — never Date.now() in tests, per spec §2 (determinism).
const NOW = new Date("2026-07-08T12:00:00Z")

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    product_id: "test_sku",
    brand: "Apple",
    model: "iPhone 13",
    storage: "128GB",
    color: "Negro",
    condition: "Nuevo",
    stock_status: "available",
    price: 500,
    currency: "USD",
    stock_verified_at: "2026-07-06",
    stock_valid_until: "2026-07-13",
    price_verified_at: "2026-07-01",
    price_valid_until: "2026-07-20",
    owner: "Dante",
    source: "Stock Sheet",
    notes: "",
    ...overrides,
  }
}

describe("truth.ts — deriveFieldStatus", () => {
  it("stock vigente when now <= stock_valid_until", () => {
    const p = makeProduct({ stock_valid_until: "2026-07-10" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("vigente")
  })

  it("stock vencido when now > stock_valid_until", () => {
    const p = makeProduct({ stock_valid_until: "2026-07-01" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("vencido")
  })

  it("price vigente independently of stock status", () => {
    const p = makeProduct({ stock_valid_until: "2026-06-01", price_valid_until: "2026-07-20" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("vencido")
    expect(deriveFieldStatus(p, "price", NOW)).toBe("vigente")
  })

  it("price vencido independently of stock status", () => {
    const p = makeProduct({ stock_valid_until: "2026-07-20", price_valid_until: "2026-06-01" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("vigente")
    expect(deriveFieldStatus(p, "price", NOW)).toBe("vencido")
  })

  it("stock_status unknown is always desconocido, regardless of dates", () => {
    const p = makeProduct({ stock_status: "unknown", stock_valid_until: "2099-01-01" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("desconocido")
  })

  it("missing owner forces desconocido even with a vigente date (II.4/III.2)", () => {
    const p = makeProduct({ owner: "" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("desconocido")
    expect(deriveFieldStatus(p, "price", NOW)).toBe("desconocido")
  })

  it("missing source forces desconocido even with a vigente date (II.4/III.2)", () => {
    const p = makeProduct({ source: "" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("desconocido")
  })

  it("owner/source presence alone does not make a stale field vigente", () => {
    const p = makeProduct({ owner: "Dante", source: "Stock Sheet", stock_valid_until: "2020-01-01" })
    expect(deriveFieldStatus(p, "stock", NOW)).toBe("vencido")
  })

  it("policy_eligibility (buildEvidence.status) is always derived, matches deriveFieldStatus", () => {
    const p = makeProduct()
    const ev = buildEvidence(p, "stock", NOW)
    expect(ev.status).toBe(deriveFieldStatus(p, "stock", NOW))
    expect(ev.owner).toBe(p.owner)
    expect(ev.source).toBe(p.source)
  })
})

describe("truth.ts — findCandidates / classifyMatch", () => {
  it("exact: brand+model+storage+color narrows to exactly one SKU", () => {
    const candidates = findCandidates({ brand: "Apple", model: "iPhone 13 Pro Max", storage: "256GB", color: "Azul" })
    expect(classifyMatch(candidates)).toBe("exact")
    expect(candidates).toHaveLength(1)
    expect(candidates[0].product_id).toBe("iphone_13pm_256_azul")
  })

  it("ambiguous: model alone matches more than one SKU", () => {
    const candidates = findCandidates({ brand: "Apple", model: "iPhone 13" })
    expect(classifyMatch(candidates)).toBe("ambiguous")
    expect(candidates.length).toBeGreaterThan(1)
  })

  it("model matching is exact, not substring — 'iPhone 13' never matches 'iPhone 13 Pro Max'", () => {
    const candidates = findCandidates({ brand: "Apple", model: "iPhone 13" })
    expect(candidates.every((p) => p.model === "iPhone 13")).toBe(true)
  })

  it("not_found: brand not present in catalog at all", () => {
    const candidates = findCandidates({ brand: "Samsung", model: "S25 Ultra" })
    expect(classifyMatch(candidates)).toBe("not_found")
  })

  it("not_found: model does not exist for an otherwise-known brand", () => {
    const candidates = findCandidates({ brand: "Apple", model: "iPhone 15", storage: "128GB" })
    expect(classifyMatch(candidates)).toBe("not_found")
  })

  it("adding a color narrows ambiguous down to exact", () => {
    const candidates = findCandidates({ brand: "Apple", model: "iPhone 13", color: "Azul" })
    expect(classifyMatch(candidates)).toBe("exact")
    expect(candidates[0].product_id).toBe("iphone_13_128_azul")
  })

  it("loadProducts returns the full catalog untouched", () => {
    expect(loadProducts().length).toBeGreaterThanOrEqual(11)
  })
})
