// src/intelligence/computeInsights.ts

export interface InsightsInput {
  trend: "up" | "down" | "flat"
  buySignal: boolean
  confidence: number
  probabilityDrop: number
  momentumDirection: "Up" | "Down" | "Flat"
  projectedRangeLow: number
  projectedRangeHigh: number
}

export interface InsightsResult {
  summary: string
  positioningComment: string
  momentumComment: string
  riskLevel: "Low" | "Moderate" | "Elevated"
  actionBias: "Buy" | "Wait" | "Monitor"
}

export function computeInsights(
  input: InsightsInput
): InsightsResult {
  const {
    trend,
    buySignal,
    confidence,
    probabilityDrop,
    momentumDirection,
    projectedRangeLow,
    projectedRangeHigh,
  } = input

  /* ----------------------------- Risk Level ----------------------------- */

  let riskLevel: "Low" | "Moderate" | "Elevated"

  if (probabilityDrop > 70) {
    riskLevel = "Elevated"
  } else if (probabilityDrop >= 40) {
    riskLevel = "Moderate"
  } else {
    riskLevel = "Low"
  }

  /* ----------------------------- Action Bias ---------------------------- */

  let actionBias: "Buy" | "Wait" | "Monitor" = "Monitor"

  if (buySignal && probabilityDrop < 50) {
    actionBias = "Buy"
  } else if (buySignal && probabilityDrop >= 50) {
    actionBias = "Wait"
  } else if (!buySignal && probabilityDrop > 70) {
    actionBias = "Wait"
  }

  /* --------------------------- Trend Framing ---------------------------- */

  let trendStatement: string

  if (trend === "down") {
    trendStatement =
      "Pricing has been trending lower over the recent observation window."
  } else if (trend === "up") {
    trendStatement =
      "Pricing has been trending higher over the recent observation window."
  } else {
    trendStatement =
      "Pricing has remained relatively stable over the recent observation window."
  }

  /* ----------------------- Positioning Commentary ----------------------- */

  const positioningComment = buySignal
    ? "Current fare levels sit meaningfully below recent averages, indicating attractive historical positioning."
    : "Current fare levels do not yet reflect a meaningful discount relative to recent averages."

  /* ------------------------- Momentum Commentary ------------------------ */

  let momentumComment: string

  if (momentumDirection === "Down") {
    momentumComment =
      `Short-term pressure remains to the downside, with modeled range support near ${projectedRangeLow}.`
  } else if (momentumDirection === "Up") {
    momentumComment =
      `Upward pressure is building, with modeled resistance forming near ${projectedRangeHigh}.`
  } else {
    momentumComment =
      "Short-term directional pressure is currently neutral."
  }

  /* ----------------------------- Summary Core ---------------------------- */

  let summary: string

  if (buySignal && probabilityDrop >= 70) {
    summary =
      `While pricing appears historically attractive, downside momentum remains elevated. Additional short-term weakness is statistically likely.`
  } else if (buySignal && probabilityDrop < 50) {
    summary =
      `Current pricing reflects strong historical value with limited short-term downside pressure. Conditions favor constructive entry.`
  } else if (!buySignal && probabilityDrop > 70) {
    summary =
      `Pricing lacks historical value support and continues to show elevated downside probability. Patience is warranted.`
  } else {
    summary =
      `Market conditions remain mixed, with moderate directional pressure and balanced valuation signals.`
  }

  summary += ` Model confidence stands at ${confidence}%.`

  return {
    summary,
    positioningComment,
    momentumComment,
    riskLevel,
    actionBias,
  }
}