import { env } from "../config/env.js"
import { SkysirvAirportPressureFlightPerformanceSignal } from "./skysirvLiveAirportPressure.service.js"

type FlightAwareAirportDelayReason = {
  category?: string
  color?: "red" | "yellow" | "green" | string
  delay_secs?: number
  reason?: string
}

type FlightAwareAirportDelay = {
  airport?: string
  category?: string
  color?: "red" | "yellow" | "green" | string
  delay_secs?: number
  reasons?: FlightAwareAirportDelayReason[]
}

type FlightAwareAirportDelaysResponse = {
  delays?: FlightAwareAirportDelay[]
  links?: {
    next?: string | null
  } | null
  num_pages?: number
}

const FLIGHTAWARE_REQUEST_TIMEOUT_MS = 12_000

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeFlightAwareAirportCode(
  rawAirportCode: string | undefined,
  skysirvAirportCodes: Set<string>,
) {
  if (!rawAirportCode) return null

  const airportCode = rawAirportCode.trim().toUpperCase()

  if (skysirvAirportCodes.has(airportCode)) {
    return airportCode
  }

  const knownSpecialCases: Record<string, string> = {
    TJSJ: "SJU",
  }

  if (knownSpecialCases[airportCode]) {
    return knownSpecialCases[airportCode]
  }

  if (airportCode.length === 4) {
    const possibleIataCode = airportCode.slice(1)

    if (skysirvAirportCodes.has(possibleIataCode)) {
      return possibleIataCode
    }
  }

  return null
}

function colorToBasePressure(color: string | undefined) {
  if (color === "red") return 85
  if (color === "yellow") return 55
  if (color === "green") return 25

  return 35
}

function normalizeDelayToSignal(
  delay: FlightAwareAirportDelay,
): SkysirvAirportPressureFlightPerformanceSignal {
  const largestDelaySeconds = toNumber(delay.delay_secs)
  const largestDelayMinutes = Math.round(largestDelaySeconds / 60)

  const basePressure = colorToBasePressure(delay.color)

  const delayMinutesPressure =
    largestDelayMinutes > 0 ? Math.min(100, largestDelayMinutes) : basePressure

  const departureDelayPercent = clampPercent(
    Math.max(basePressure, delayMinutesPressure),
  )

  return {
    source: "FlightAware",
    observedAt: new Date().toISOString(),
    departureDelayPercent,
    arrivalDelayPercent: null,
    cancellationPercent: null,
    averageDepartureDelayMinutes: largestDelayMinutes,
    averageArrivalDelayMinutes: null,
  }
}

export async function getFlightAwareAirportDelays(
  airportCodes: string[],
): Promise<Map<string, SkysirvAirportPressureFlightPerformanceSignal>> {
  const signals = new Map<string, SkysirvAirportPressureFlightPerformanceSignal>()

  if (!env.FLIGHTAWARE_ENABLED) return signals
  if (!env.FLIGHTAWARE_API_KEY) return signals

  const skysirvAirportCodes = new Set(
    airportCodes.map((code) => code.trim().toUpperCase()).filter(Boolean),
  )

  if (skysirvAirportCodes.size === 0) return signals

  const url = new URL(`${env.FLIGHTAWARE_AEROAPI_BASE_URL}/airports/delays`)
  url.searchParams.set("max_pages", "1")

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    FLIGHTAWARE_REQUEST_TIMEOUT_MS,
  )

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "SkysirvLive/1.0",
        "x-apikey": env.FLIGHTAWARE_API_KEY,
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `FlightAware airport delays request failed with ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as FlightAwareAirportDelaysResponse
    const delays = Array.isArray(data.delays) ? data.delays : []

    for (const delay of delays) {
      const airportCode = normalizeFlightAwareAirportCode(
        delay.airport,
        skysirvAirportCodes,
      )

      if (!airportCode) continue

      signals.set(airportCode, normalizeDelayToSignal(delay))
    }

    return signals
  } finally {
    clearTimeout(timeoutId)
  }
}