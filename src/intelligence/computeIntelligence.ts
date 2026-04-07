// src/intelligence/computeIntelligence.ts

import { computePredict, PredictResult } from "./computePredict.js"

export interface PriceHistoryRow {
  price: number
  currency?: string
  captured_at?: Date
}

export interface IntelligenceInput {
  routeHash: string
  history: PriceHistoryRow[]
}

export interface IntelligenceResult {
  routeHash: string
  currentPrice: number
  baselinePrice: number
  historyDepth: number
  volatility: number
  dealLevel: "rare_deal" | "good_deal" | "fair_price" | "expensive" | "unknown"
  predict: PredictResult
}

/* -------------------------------------------------------------------------- */
/*                             Helper Functions                               */
/* -------------------------------------------------------------------------- */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

function computeVolatility(values: number[]): number {
  if (values.length < 2) return 0

  const mean = values.reduce((a, b) => a + b, 0) / values.length

  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length

  const std = Math.sqrt(variance)

  return Math.round(std * 100) / 100
}

function classifyDeal(
  current: number,
  baseline: number
): "rare_deal" | "good_deal" | "fair_price" | "expensive" | "unknown" {

  if (!baseline || baseline <= 0) return "unknown"

  const ratio = current / baseline

  if (ratio <= 0.65) return "rare_deal"
  if (ratio <= 0.80) return "good_deal"
  if (ratio <= 1.05) return "fair_price"

  return "expensive"
}

/* -------------------------------------------------------------------------- */
/*                        Core Intelligence Orchestrator                      */
/* -------------------------------------------------------------------------- */

export function computeIntelligence(
  input: IntelligenceInput
): IntelligenceResult {

  const { routeHash, history } = input

  if (!history || history.length === 0) {
    throw new Error("No price history provided to computeIntelligence")
  }

  // Ensure chronological order (oldest → newest)
  const sortedHistory = [...history].sort((a, b) => {
    if (!a.captured_at || !b.captured_at) return 0
    return new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  })

  const prices = sortedHistory.map((h) => Number(h.price))

  const currentPrice = prices[prices.length - 1]

  const baselinePrice = median(prices)

  const volatility = computeVolatility(prices)

  const dealLevel = classifyDeal(currentPrice, baselinePrice)

  const predict = computePredict({
    prices,
    currentPrice,
    baselinePrice,
  })

  return {
    routeHash,
    currentPrice: Number((currentPrice / 100).toFixed(2)),
    baselinePrice: Number((baselinePrice / 100).toFixed(2)),
    historyDepth: prices.length,
    volatility: Number((volatility / 100).toFixed(2)),
    dealLevel,
    predict,
  }
}