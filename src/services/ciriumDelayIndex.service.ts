import { env } from "../config/env.js"
import type { SkysirvAirportPressureFlightPerformanceSignal } from "./skysirvLiveAirportPressure.service.js"

type CiriumDelayIndexResponse = {
  delayIndexes?: CiriumDelayIndex[]
  delayIndex?: CiriumDelayIndex[]
  data?: CiriumDelayIndex[]
  items?: CiriumDelayIndex[]
  results?: CiriumDelayIndex[]
  error?: unknown
}

type CiriumDelayIndex = {
  airport?: {
    fs?: string
    iata?: string
    icao?: string
    faa?: string
    name?: string
  }
  fs?: string
  iata?: string
  icao?: string
  faa?: string
  airportCode?: string
  airportIata?: string
  name?: string
  dateStart?: string
  dateEnd?: string
  observedAt?: string
  flights?: number
  observations?: number
  canceled?: number
  cancelled?: number
  onTime?: number
  delayed15?: number
  delayed30?: number
  delayed45?: number
  score?: number
  index?: number
  delayIndex?: number
  normalizedScore?: number
}

const CIRIUM_REQUEST_TIMEOUT_MS = 12_000

function getAirportCode(delayIndex: CiriumDelayIndex) {
  return (
    delayIndex.airport?.iata ??
    delayIndex.iata ??
    delayIndex.airportIata ??
    delayIndex.airportCode ??
    delayIndex.airport?.faa ??
    delayIndex.faa ??
    delayIndex.airport?.fs ??
    delayIndex.fs ??
    null
  )
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreToPressurePercent(delayIndex: CiriumDelayIndex) {
  const normalizedScore = toNumber(delayIndex.normalizedScore)

  if (normalizedScore > 0) {
    return normalizedScore <= 5
      ? clampPercent(normalizedScore * 20)
      : clampPercent(normalizedScore)
  }

  const score =
    toNumber(delayIndex.score) ||
    toNumber(delayIndex.index) ||
    toNumber(delayIndex.delayIndex)

  if (score > 0) {
    return score <= 5 ? clampPercent(score * 20) : clampPercent(score)
  }

  return 0
}

function normalizeDelayIndex(
  delayIndex: CiriumDelayIndex,
): SkysirvAirportPressureFlightPerformanceSignal | null {
  const flights = toNumber(delayIndex.flights)
  const observations = toNumber(delayIndex.observations)

  const denominator = observations > 0 ? observations : flights

  const canceled = toNumber(delayIndex.canceled) || toNumber(delayIndex.cancelled)
  const delayed15 = toNumber(delayIndex.delayed15)
  const delayed30 = toNumber(delayIndex.delayed30)
  const delayed45 = toNumber(delayIndex.delayed45)

  const delayedFlights = delayed15 + delayed30 + delayed45
  const scorePressure = scoreToPressurePercent(delayIndex)

  const departureDelayPercent =
    denominator > 0
      ? clampPercent(Math.max((delayedFlights / denominator) * 100, scorePressure))
      : scorePressure

  const cancellationPercent =
    denominator > 0 ? clampPercent((canceled / denominator) * 100) : 0

  const averageDepartureDelayMinutes =
    denominator > 0
      ? Math.round(
        (delayed15 * 22.5 + delayed30 * 37.5 + delayed45 * 55) / denominator,
      )
      : departureDelayPercent

  if (
    departureDelayPercent <= 0 &&
    cancellationPercent <= 0 &&
    averageDepartureDelayMinutes <= 0
  ) {
    return null
  }

  return {
    source: "Cirium",
    observedAt:
      delayIndex.dateEnd ??
      delayIndex.observedAt ??
      new Date().toISOString(),
    departureDelayPercent,
    arrivalDelayPercent: null,
    cancellationPercent,
    averageDepartureDelayMinutes,
    averageArrivalDelayMinutes: null,
  }
}

function getDelayIndexesFromResponse(data: CiriumDelayIndexResponse) {
  if (Array.isArray(data.delayIndexes)) return data.delayIndexes
  if (Array.isArray(data.delayIndex)) return data.delayIndex
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.results)) return data.results

  return []
}

function getFlightStatsDelayIndexUrl(airportCodes: string[]) {
  const url = new URL(`${env.CIRIUM_DELAY_INDEX_BASE_URL}/airports`)

  url.searchParams.set("appId", env.CIRIUM_APP_ID ?? "")
  url.searchParams.set("appKey", env.CIRIUM_APP_KEY ?? "")
  url.searchParams.set("airports", airportCodes.join(","))

  return url
}

function getSkyDelayIndexUrl(airportCodes: string[]) {
  if (!env.CIRIUM_SKY_BASE_URL) return null

  const url = new URL(env.CIRIUM_SKY_BASE_URL)
  const normalizedPath = url.pathname.replace(/\/$/, "")
  const airportPathValue = airportCodes.join(",")

  const alreadyLooksLikeDelayIndexEndpoint =
    normalizedPath.toLowerCase().includes("/airports/delay-index")

  if (alreadyLooksLikeDelayIndexEndpoint) {
    url.pathname = `${normalizedPath}/${airportPathValue}`
  } else if (!normalizedPath || normalizedPath === "/") {
    url.pathname = `/v1/airports/delay-index/${airportPathValue}`
  } else {
    url.pathname = `${normalizedPath}/airports/delay-index/${airportPathValue}`
  }

  url.searchParams.set("codeType", "IATA")
  url.searchParams.set("classification", "5")

  return url
}

function getCiriumRequestHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "SkysirvLive/1.0",
  }

  if (env.CIRIUM_API_MODE === "sky" && env.CIRIUM_SKY_SECRET) {
    headers.Authorization = env.CIRIUM_SKY_SECRET
  }

  return headers
}

async function fetchCiriumDelayIndexes(params: {
  url: URL
  headers: Record<string, string>
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CIRIUM_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(params.url, {
      method: "GET",
      headers: params.headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `Cirium Delay Index request failed with ${response.status} ${response.statusText}`,
      )
    }

    return (await response.json()) as CiriumDelayIndexResponse
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getCiriumAirportDelayIndexes(
  airportCodes: string[],
): Promise<Map<string, SkysirvAirportPressureFlightPerformanceSignal>> {
  const signals = new Map<string, SkysirvAirportPressureFlightPerformanceSignal>()

  if (!env.CIRIUM_ENABLED) return signals

  const normalizedAirportCodes = airportCodes
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)

  if (normalizedAirportCodes.length === 0) return signals

  if (env.CIRIUM_API_MODE === "flightstats") {
    if (!env.CIRIUM_APP_ID || !env.CIRIUM_APP_KEY) return signals
  }

  if (env.CIRIUM_API_MODE === "sky") {
    if (
      !env.CIRIUM_SKY_IDENTIFIER ||
      !env.CIRIUM_SKY_SECRET ||
      !env.CIRIUM_SKY_BASE_URL
    ) {
      return signals
    }
  }

  const url =
    env.CIRIUM_API_MODE === "sky"
      ? getSkyDelayIndexUrl(normalizedAirportCodes)
      : getFlightStatsDelayIndexUrl(normalizedAirportCodes)

  if (!url) return signals

  const data = await fetchCiriumDelayIndexes({
    url,
    headers: getCiriumRequestHeaders(),
  })

  const delayIndexes = getDelayIndexesFromResponse(data)

  for (const delayIndex of delayIndexes) {
    const airportCode = getAirportCode(delayIndex)

    if (!airportCode) continue

    const normalizedSignal = normalizeDelayIndex(delayIndex)

    if (!normalizedSignal) continue

    signals.set(airportCode.toUpperCase(), normalizedSignal)
  }

  return signals
}