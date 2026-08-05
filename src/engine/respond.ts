// Response templates — Revenue OS Demo v0
//
// Template strings only, no LLM (approved decision: "Respuestas por templates, no por LLM").
// Composes one sentence per claim/situation, in a fixed order, so multi-intent messages never
// silently drop the confirmable part behind the top-level decision (closed decision C).

import { loadProducts, type Product } from "./truth"
import type { Claim, PolicyResult } from "./policy"

const NEVER_AUTO_LABELS: Record<string, string> = {
  payment_question: "las opciones de pago",
  installments_question: "las cuotas",
  trade_in_question: "la permuta",
  reservation_question: "la reserva",
  delivery_question: "la entrega",
}

function describeProduct(p: Product): string {
  return `${p.model} ${p.storage} ${p.color}`
}

function findProduct(product_id: string | undefined, products: Product[]): Product | undefined {
  return product_id ? products.find((p) => p.product_id === product_id) : undefined
}

function confirmedSentence(claim: Claim, products: Product[]): string {
  const product = findProduct(claim.product_id, products)
  if (!product) return ""
  if (claim.attribute === "stock") return `Sí, tenemos disponible el ${describeProduct(product)}.`
  return `El ${describeProduct(product)} está a USD ${product.price}.`
}

function attributeBlockedSentence(claim: Claim, products: Product[]): string {
  const product = findProduct(claim.product_id, products)
  const label = claim.attribute === "price" ? "el precio vigente" : "la disponibilidad actual"
  const name = product ? ` del ${describeProduct(product)}` : ""
  return `Estoy confirmando ${label}${name} para no pasarte un dato incorrecto. Apenas esté validado te aviso por acá.`
}

function neverAutoSentence(intents: string[]): string {
  const labels = [...new Set(intents.map((i) => NEVER_AUTO_LABELS[i]).filter(Boolean))]
  if (labels.length === 0) return "Ya te paso con una persona del equipo para ayudarte."
  return `Para ${labels.join(" y ")} te paso con una persona del equipo.`
}

function ambiguousSentence(result: PolicyResult, products: Product[]): string {
  const model = result.detected_entities.model ?? "ese modelo"
  const options = result.matched_products
    .map((id) => findProduct(id, products))
    .filter((p): p is Product => Boolean(p))
    .map((p) => `${p.storage} ${p.color}`)
    .join(", ")
  return `Tenemos varias opciones de ${model}: ${options}. ¿Cuál te interesa?`
}

function notFoundSentence(): string {
  return "No tengo ese modelo en el catálogo en este momento. ¿Te interesa ver alternativas disponibles?"
}

function catalogSentence(): string {
  return "Trabajamos con equipos Apple (iPhone). Contame qué modelo buscás y te confirmo disponibilidad y precio."
}

function unknownSentence(): string {
  return "No llegué a entender bien tu consulta. Ya te paso con una persona para ayudarte mejor."
}

export function buildResponse(result: PolicyResult, products: Product[] = loadProducts()): string {
  const parts: string[] = []

  for (const claim of result.confirmed_claims) {
    const s = confirmedSentence(claim, products)
    if (s) parts.push(s)
  }

  const attributeBlocked = result.blocked_claims.filter(
    (c) => c.attribute !== undefined && c.reason !== "customer_input_not_truth",
  )
  for (const claim of attributeBlocked) {
    parts.push(attributeBlockedSentence(claim, products))
  }

  const neverAutoClaims = result.blocked_claims.filter((c) => c.attribute === undefined && c.reason !== "customer_input_not_truth")
  if (neverAutoClaims.length > 0) {
    parts.push(neverAutoSentence(neverAutoClaims.map((c) => c.intent)))
  }

  if (result.match_type === "ambiguous") parts.push(ambiguousSentence(result, products))
  if (result.match_type === "not_found") parts.push(notFoundSentence())
  if (result.detected_intents.includes("catalog_question")) parts.push(catalogSentence())
  if (result.detected_intents.includes("unknown")) parts.push(unknownSentence())

  return parts.join(" ")
}
