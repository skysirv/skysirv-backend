import type { Kysely } from "kysely"
import type { DB } from "../db/types.js"

export interface SkyscoreIntelligence {
  routeHash: string
  currentPrice: number
  currency: string
  average7d: number | null
  average30d: number | null
  volatility: number | null
  trend: "up" | "down" | "flat"
  buySignal: boolean
  confidence: number
  history: {
    price: number
    capturedAt: Date
  }[]
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function calculateStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = calculateAverage(values)!
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
  return Math.sqrt(variance)
}

function calculateTrend(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat"

  const first = values[0]
  const last = values[values.length - 1]
  const diff = last - first

  if (Math.abs(diff) < 3) return "flat"
  return diff > 0 ? "up" : "down"
}

export async function computeSkyscore(
  db: Kysely<DB>,
  routeHash: string
): Promise<SkyscoreIntelligence | null> {
  const rows = await db
    .selectFrom("flight_price_history")
    .select(["price", "currency", "captured_at"])
    .where("route_hash", "=", routeHash)
    .orderBy("captured_at", "asc")
    .limit(180)
    .execute()

  const safeRows = rows.filter(
    (r): r is { price: number; currency: string; captured_at: Date } =>
      r.price !== undefined &&
      r.price !== null &&
      r.currency !== undefined &&
      r.currency !== null &&
      r.captured_at !== undefined &&
      r.captured_at !== null
  )

  if (safeRows.length === 0) return null

  const fullPrices = safeRows.map((r) => r.price)
  const currentPrice = fullPrices[fullPrices.length - 1]
  const currency = safeRows[safeRows.length - 1].currency

  const scoringPrices = fullPrices.slice(-30)
  const last7 = scoringPrices.slice(-7)

  const average7d = calculateAverage(last7)
  const average30d = calculateAverage(scoringPrices)
  const volatility = calculateStdDev(scoringPrices)
  const trend = calculateTrend(scoringPrices)

  const buySignal =
    average30d !== null &&
    currentPrice < average30d * 0.95 &&
    trend !== "up"

  let confidence = 50

  if (trend === "down") confidence += 15
  if (volatility !== null && volatility < 15) confidence += 10
  if (buySignal) confidence += 15

  confidence = Math.min(100, Math.max(0, confidence))

  return {
    routeHash,
    currentPrice,
    currency,
    average7d,
    average30d,
    volatility,
    trend,
    buySignal,
    confidence,
    history: safeRows.map((r) => ({
      price: r.price,
      capturedAt: r.captured_at,
    })),
  }
}