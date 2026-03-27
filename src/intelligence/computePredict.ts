// src/intelligence/computePredict.ts

export interface PredictInput {
  prices: number[]           // chronological order (oldest → newest)
  currentPrice: number
  baselinePrice: number
}

export interface PredictResult {
  probabilityDrop: number
  projectedRangeLow: number
  projectedRangeHigh: number
  momentumDirection: "Up" | "Down" | "Flat"
  confidenceScore: number
}

/* -------------------------------------------------------------------------- */
/*                               Math Utilities                               */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function mean(values: number[]): number {
  if (!values.length) return 0
  const clean = values.filter((v) => Number.isFinite(v))
  if (!clean.length) return 0
  return clean.reduce((a, b) => a + b, 0) / clean.length
}

function standardDeviation(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return 0

  const avg = mean(clean)

  const variance =
    clean.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) /
    clean.length

  return Math.sqrt(variance)
}

/* -------------------------------------------------------------------------- */
/*                          Linear Regression (Slope)                         */
/* -------------------------------------------------------------------------- */

function computeSlope(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v))

  const n = clean.length
  if (n < 2) return 0

  const xMean = (n - 1) / 2
  const yMean = mean(clean)

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (clean[i] - yMean)
    denominator += Math.pow(i - xMean, 2)
  }

  if (denominator === 0) return 0

  const slope = numerator / denominator

  return Number.isFinite(slope) ? slope : 0
}

/* -------------------------------------------------------------------------- */
/*                          Core Deterministic Engine                         */
/* -------------------------------------------------------------------------- */

export function computePredict(input: PredictInput): PredictResult {

  const prices = (input.prices || []).map((p) => Number(p)).filter((p) => Number.isFinite(p))

  const currentPrice = Number(input.currentPrice)
  const baselinePrice = Number(input.baselinePrice)

  if (!Number.isFinite(currentPrice) || !Number.isFinite(baselinePrice) || baselinePrice === 0) {
    return {
      probabilityDrop: 50,
      projectedRangeLow: currentPrice || 0,
      projectedRangeHigh: currentPrice || 0,
      momentumDirection: "Flat",
      confidenceScore: 20,
    }
  }

  if (prices.length < 7) {
    return {
      probabilityDrop: 50,
      projectedRangeLow: currentPrice,
      projectedRangeHigh: currentPrice,
      momentumDirection: "Flat",
      confidenceScore: 20,
    }
  }

  const last7 = prices.slice(-7)
  const last14 = prices.slice(-14)

  /* ------------------------------ Trend Slope ------------------------------ */

  const longSlope = computeSlope(last7)
  const trendScore = clamp(-longSlope * 1000, -100, 100)

  /* ------------------------------ Volatility ------------------------------- */

  const volatility = standardDeviation(last14)

  const volatilityIndex =
    baselinePrice > 0 ? volatility / baselinePrice : 0

  const compressionScore = clamp((1 - volatilityIndex) * 100, -100, 100)

  /* -------------------------- Mean Reversion ------------------------------- */

  const rollingMean = mean(last14)

  const position =
    rollingMean !== 0
      ? (currentPrice - rollingMean) / rollingMean
      : 0

  const meanReversionScore = clamp(-position * 100, -100, 100)

  /* -------------------------- Acceleration Bias ---------------------------- */

  const shortSlope = computeSlope(prices.slice(-3))

  const acceleration = shortSlope - longSlope

  const accelerationScore = clamp(-acceleration * 1000, -100, 100)

  /* ----------------------- Volatility Expansion Check ---------------------- */

  const recentVolatility = standardDeviation(prices.slice(-7))
  const olderVolatility = standardDeviation(prices.slice(-14, -7))

  let volatilityExpansionScore = 0

  if (recentVolatility > olderVolatility && baselinePrice > 0) {
    volatilityExpansionScore = clamp(
      ((recentVolatility - olderVolatility) / baselinePrice) * 200,
      -100,
      100
    )
  }

  /* -------------------------- Weighted Probability ------------------------- */

  const rawScore =
    trendScore * 0.30 +
    compressionScore * 0.20 +
    meanReversionScore * 0.25 +
    accelerationScore * 0.15 +
    volatilityExpansionScore * 0.10

  const probabilityDrop = clamp(50 + rawScore, 0, 100)

  /* ----------------------------- Price Envelope ---------------------------- */

  const projectedRangeLow = Math.max(
    0,
    currentPrice - volatility * 1.2
  )

  const projectedRangeHigh =
    currentPrice + volatility * 1.2

  /* --------------------------- Momentum Direction -------------------------- */

  let momentumDirection: "Up" | "Down" | "Flat" = "Flat"

  if (trendScore > 10) momentumDirection = "Down"
  else if (trendScore < -10) momentumDirection = "Up"

  /* ------------------------------ Confidence ------------------------------- */

  const signals = [
    trendScore > 0,
    meanReversionScore > 0,
    accelerationScore > 0,
  ]

  const alignmentFactor =
    signals.filter(Boolean).length / signals.length

  const dataDepthFactor = clamp(prices.length / 30, 0, 1)

  const confidenceScore = clamp(
    (dataDepthFactor * 0.4 +
      (1 - volatilityIndex) * 0.3 +
      alignmentFactor * 0.3) *
      100,
    0,
    100
  )

  return {
    probabilityDrop: Math.round(probabilityDrop),
    projectedRangeLow: Math.round(projectedRangeLow),
    projectedRangeHigh: Math.round(projectedRangeHigh),
    momentumDirection,
    confidenceScore: Math.round(confidenceScore),
  }
}