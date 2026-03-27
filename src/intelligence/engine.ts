// src/intelligence/engine.ts

import { FlightProvider, FlightResult } from "../providers/types.js"

export interface IntelligenceResponse {
  route: string
  baselinePrice: number
  currentBest: number
  pricePositioning: string
  volatilityIndex: "Low" | "Moderate" | "High"
  bookingSignal: string
  skyscore: number
  flights: FlightResult[]
}

export class IntelligenceEngine {
  constructor(private provider: FlightProvider) {}

  async getIntelligence(
    route: string,
    departureDate: string
  ): Promise<IntelligenceResponse> {
    const [origin, destination] = route.split("-")

    if (!origin || !destination) {
      throw new Error("Invalid route format")
    }

    const results = await this.provider.searchFlights({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departureDate,
    })

    if (!results || results.length === 0) {
      throw new Error("No flight data returned from provider")
    }

    const prices = results.map(f => f.price)

    // Baseline
    const total = prices.reduce((sum, price) => sum + price, 0)
    const baseline = total / prices.length

    // Best price
    const currentBest = Math.min(...prices)

    // Positioning
    const positioningRaw = ((currentBest - baseline) / baseline) * 100
    const positioningFormatted = `${positioningRaw.toFixed(1)}%`

    // Volatility
    const maxPrice = Math.max(...prices)
    const spread = maxPrice - currentBest
    const spreadPercent = spread / baseline

    let volatilityIndex: "Low" | "Moderate" | "High"

    if (spreadPercent <= 0.05) {
      volatilityIndex = "Low"
    } else if (spreadPercent <= 0.15) {
      volatilityIndex = "Moderate"
    } else {
      volatilityIndex = "High"
    }

    // Booking Signal
    let bookingSignal = "Fair Price"

    if (positioningRaw <= -10) {
      bookingSignal = "Strong Buy"
    } else if (positioningRaw <= -3) {
      bookingSignal = "Favorable Window"
    } else if (positioningRaw > 5) {
      bookingSignal = "Overpriced"
    }

    if (volatilityIndex === "High" && positioningRaw <= -3) {
      bookingSignal = "Act Quickly"
    }

    if (volatilityIndex === "High" && positioningRaw > 5) {
      bookingSignal = "Monitor Closely"
    }

    // 🧠 Skyscore™ Calculation

    // 1️⃣ Price Component (0–60)
    let priceScore = 0
    if (positioningRaw <= -15) {
      priceScore = 60
    } else if (positioningRaw >= 15) {
      priceScore = 0
    } else {
      priceScore = 60 - ((positioningRaw + 15) / 30) * 60
    }

    // 2️⃣ Volatility Component (0–25)
    let volatilityScore = 0
    if (volatilityIndex === "Low") volatilityScore = 25
    if (volatilityIndex === "Moderate") volatilityScore = 15
    if (volatilityIndex === "High") volatilityScore = 5

    // 3️⃣ Signal Boost (0–15)
    let signalScore = 0
    if (bookingSignal === "Strong Buy" || bookingSignal === "Act Quickly") signalScore = 15
    if (bookingSignal === "Favorable Window") signalScore = 10
    if (bookingSignal === "Fair Price") signalScore = 5

    let skyscore = priceScore + volatilityScore + signalScore

    // Clamp 0–100
    skyscore = Math.max(0, Math.min(100, skyscore))

    return {
      route: `${origin.toUpperCase()}-${destination.toUpperCase()}`,
      baselinePrice: Number(baseline.toFixed(2)),
      currentBest,
      pricePositioning: positioningFormatted,
      volatilityIndex,
      bookingSignal,
      skyscore: Number(skyscore.toFixed(1)),
      flights: results,
    }
  }
}