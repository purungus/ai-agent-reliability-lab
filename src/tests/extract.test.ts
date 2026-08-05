import { describe, expect, it } from "vitest"
import { extract } from "../engine/extract"
import messages from "../fixtures/messages.json"

// Intent order is not semantically meaningful — compare as sets.
const sorted = (arr: string[]) => [...arr].sort()

describe("extract.ts — per-fixture intent + entity extraction", () => {
  for (const m of messages) {
    it(`${m.message_id}: "${m.text}"`, () => {
      const result = extract(m.text)
      expect(sorted(result.intents)).toEqual(sorted(m.expected_intents))
      expect(result.entities).toMatchObject(m.expected_entities)
    })
  }
})

describe("extract.ts — targeted behaviour", () => {
  it("model matching disambiguates 'iPhone 13' from 'iPhone 13 Pro Max' (closed decision B)", () => {
    expect(extract("Tenés iPhone 13?").entities.model).toBe("iPhone 13")
    expect(extract("Tenés iPhone 13 Pro Max?").entities.model).toBe("iPhone 13 Pro Max")
    expect(extract("Tenés iPhone 13 Pro?").entities.model).toBe("iPhone 13 Pro")
  })

  it("multi-intent: a message with both a product claim and a never_auto claim keeps both", () => {
    const r = extract("Tenés el 13 azul y hacés cuotas?")
    expect(sorted(r.intents)).toEqual(sorted(["stock_availability", "installments_question"]))
  })

  it("delivery question alone does NOT fire stock_availability just because it contains 'tenés'", () => {
    const r = extract("Tenés entrega hoy?")
    expect(r.intents).toEqual(["delivery_question"])
    expect(r.entities.model).toBeUndefined()
  })

  it("injection: a customer-stated price is flagged as customer_price_claim, never as an entity", () => {
    const r = extract("Me habían dicho que el 13 Pro Max estaba a 500, confirmás?")
    expect(r.customer_price_claim).toBe(500)
    // 500 must not leak into storage/model/any entity field
    expect(Object.values(r.entities)).not.toContain("500")
    expect(r.entities.storage).toBeUndefined()
  })

  it("does not flag a customer_price_claim when no leftover number exists (normal price question)", () => {
    const r = extract("Cuánto sale el iPhone 11 64?")
    expect(r.customer_price_claim).toBeUndefined()
  })

  it("storage whitelist does not collide with model whitelist (256 is never read as a model number)", () => {
    const r = extract("Tenés iPhone 13 Pro Max 256 azul?")
    expect(r.entities.model).toBe("iPhone 13 Pro Max")
    expect(r.entities.storage).toBe("256GB")
  })

  it("unknown/unparseable message falls back to intents=['unknown']", () => {
    expect(extract("asdf no entiendo nada").intents).toEqual(["unknown"])
  })
})
