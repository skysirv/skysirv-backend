export type SkysirvAirportPressureSeverity =
  | "normal"
  | "minor"
  | "moderate"
  | "major"

export type SkysirvAirportPressureSource =
  | "faa"
  | "weather"
  | "flight_performance"

export type SkysirvAirportPressureFaaSignal = {
  severity: SkysirvAirportPressureSeverity
  statusLabel?: string | null
  departuresDelay?: number | null
  arrivalsDelay?: number | null
  groundStopActive?: boolean
  groundDelayActive?: boolean
  airportClosureActive?: boolean
  disruptionReason?: string | null
  eventType?: string | null
}

export type SkysirvAirportPressureWeatherSignal = {
  aviationRisk: SkysirvAirportPressureSeverity
  weatherSummary?: string | null
  riskReason?: string | null
  windSpeedKmh?: number | null
  windGustKmh?: number | null
  precipitationMm?: number | null
  weatherCode?: number | null
}

export type SkysirvAirportPressureFlightPerformanceSignal = {
  source: "Cirium" | "FlightAware" | "Aviationstack" | "Internal"
  observedAt?: string
  departureDelayPercent?: number | null
  arrivalDelayPercent?: number | null
  cancellationPercent?: number | null
  averageDepartureDelayMinutes?: number | null
  averageArrivalDelayMinutes?: number | null
}

export type ComputeSkysirvAirportPressureInput = {
  iata: string
  faa?: SkysirvAirportPressureFaaSignal | null
  weather?: SkysirvAirportPressureWeatherSignal | null
  flightPerformance?: SkysirvAirportPressureFlightPerformanceSignal | null
}

export type SkysirvAirportPressureResult = {
  iata: string
  pressureScore: number
  severity: SkysirvAirportPressureSeverity
  statusLabel: string
  departurePressurePercent: number
  arrivalPressurePercent: number | null
  cancellationPercent: number
  averageDepartureDelayMinutes: number
  averageArrivalDelayMinutes: number | null
  departureDelayActive: boolean
  arrivalDelayActive: boolean
  primaryReason: string | null
  sourceBreakdown: {
    faaScore: number
    weatherScore: number
    flightPerformanceScore: number
    activeSources: SkysirvAirportPressureSource[]
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function severityToScore(severity?: SkysirvAirportPressureSeverity | null) {
  if (severity === "major") return 90
  if (severity === "moderate") return 65
  if (severity === "minor") return 35

  return 0
}

function scoreToSeverity(score: number): SkysirvAirportPressureSeverity {
  if (score >= 80) return "major"
  if (score >= 55) return "moderate"
  if (score >= 25) return "minor"

  return "normal"
}

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function safeNumber(value: number | null | undefined) {
  return toFiniteNumber(value) ?? 0
}

function clampNullablePercent(value: number | null | undefined) {
  const finiteValue = toFiniteNumber(value)

  return finiteValue === null ? null : clampPercent(finiteValue)
}

function roundNullableNumber(value: number | null | undefined) {
  const finiteValue = toFiniteNumber(value)

  return finiteValue === null ? null : Math.round(finiteValue)
}

function hasPositiveNumber(value: number | null | undefined) {
  const finiteValue = toFiniteNumber(value)

  return finiteValue !== null && finiteValue > 0
}

function hasFaaEventType(
  faa: SkysirvAirportPressureFaaSignal | null | undefined,
  eventTypes: string[],
) {
  if (!faa?.eventType) return false

  const normalizedEventTypes = faa.eventType
    .toLowerCase()
    .split(/[,\s;|]+/)
    .map((eventType) => eventType.trim())
    .filter(Boolean)

  return eventTypes.some((eventType) =>
    normalizedEventTypes.includes(eventType.toLowerCase()),
  )
}

function computeFaaScore(faa?: SkysirvAirportPressureFaaSignal | null) {
  if (!faa) return 0

  if (faa.airportClosureActive || faa.groundStopActive) {
    return 100
  }

  if (faa.groundDelayActive) {
    return Math.max(70, severityToScore(faa.severity))
  }

  return severityToScore(faa.severity)
}

function computeWeatherScore(
  weather?: SkysirvAirportPressureWeatherSignal | null,
) {
  if (!weather) return 0

  if (weather.aviationRisk === "major") return 45
  if (weather.aviationRisk === "moderate") return 30
  if (weather.aviationRisk === "minor") return 12

  return 0
}

function computeFlightPerformanceScore(
  flightPerformance?: SkysirvAirportPressureFlightPerformanceSignal | null,
) {
  if (!flightPerformance) return 0

  const departureDelayPercent = safeNumber(
    flightPerformance.departureDelayPercent,
  )
  const arrivalDelayPercent = safeNumber(flightPerformance.arrivalDelayPercent)
  const cancellationPercent = safeNumber(flightPerformance.cancellationPercent)

  const averageDepartureDelayMinutes = safeNumber(
    flightPerformance.averageDepartureDelayMinutes,
  )
  const averageArrivalDelayMinutes = safeNumber(
    flightPerformance.averageArrivalDelayMinutes,
  )

  const delayPercentPressure = Math.max(
    departureDelayPercent,
    arrivalDelayPercent,
  )

  const cancellationPressure = cancellationPercent * 4

  const delayMinutesPressure = Math.max(
    averageDepartureDelayMinutes,
    averageArrivalDelayMinutes,
  )

  return clampPercent(
    Math.max(delayPercentPressure, cancellationPressure, delayMinutesPressure),
  )
}

function getStatusLabel(severity: SkysirvAirportPressureSeverity) {
  if (severity === "major") return "Major airport pressure"
  if (severity === "moderate") return "Moderate airport pressure"
  if (severity === "minor") return "Minor airport pressure"

  return "Normal"
}

function normalizeFaaReason(reason?: string | null, eventType?: string | null) {
  const normalizedReason = reason?.trim()

  if (!normalizedReason || normalizedReason.toLowerCase() === "other") {
    if (eventType === "ground_stop") return "FAA-reported ground stop"
    if (eventType === "ground_delay") return "FAA-reported ground delay"
    if (eventType === "arrival_delay") return "FAA-reported arrival delays"
    if (eventType === "departure_delay") return "FAA-reported departure delays"
    if (eventType === "airport_closure") return "FAA-reported airport restriction"

    return "FAA-reported airport delay"
  }

  if (normalizedReason.toLowerCase().startsWith("wx:")) {
    return normalizedReason.replace(/^WX:/i, "Weather: ")
  }

  if (normalizedReason.toLowerCase().startsWith("rwy:")) {
    return normalizedReason.replace(/^RWY:/i, "Runway: ")
  }

  if (normalizedReason.toLowerCase().startsWith("vol:")) {
    return normalizedReason
      .replace(/^VOL:/i, "Volume: ")
      .replace(/multi-taxi/i, "multi-taxi congestion")
  }

  return normalizedReason
}

function getPrimaryReason(input: ComputeSkysirvAirportPressureInput) {
  if (input.flightPerformance) {
    const departureDelayPercent = safeNumber(
      input.flightPerformance.departureDelayPercent,
    )
    const arrivalDelayPercent = safeNumber(
      input.flightPerformance.arrivalDelayPercent,
    )
    const cancellationPercent = safeNumber(
      input.flightPerformance.cancellationPercent,
    )

    const flightPerformanceScore = computeFlightPerformanceScore(
      input.flightPerformance,
    )

    if (
      flightPerformanceScore >= 25 ||
      cancellationPercent >= 5 ||
      departureDelayPercent >= 25 ||
      arrivalDelayPercent >= 25
    ) {
      return "Live flight performance pressure"
    }
  }

  if (input.faa) {
    const faaReason = normalizeFaaReason(
      input.faa.disruptionReason,
      input.faa.eventType,
    )

    if (faaReason) return faaReason
  }

  if (input.weather?.riskReason) {
    return input.weather.riskReason
  }

  return null
}

export function computeSkysirvAirportPressure(
  input: ComputeSkysirvAirportPressureInput,
): SkysirvAirportPressureResult {
  const faaScore = computeFaaScore(input.faa)
  const weatherScore = computeWeatherScore(input.weather)
  const flightPerformanceScore = computeFlightPerformanceScore(
    input.flightPerformance,
  )

  const pressureScore = clampPercent(
    Math.max(faaScore, weatherScore, flightPerformanceScore),
  )

  const severity = scoreToSeverity(pressureScore)

  const departurePressurePercent = clampPercent(
    safeNumber(
      input.flightPerformance?.departureDelayPercent ??
      input.faa?.departuresDelay,
    ),
  )

  const arrivalPressurePercent = clampNullablePercent(
    input.flightPerformance?.arrivalDelayPercent ?? input.faa?.arrivalsDelay,
  )

  const cancellationPercent = clampPercent(
    safeNumber(input.flightPerformance?.cancellationPercent),
  )

  const averageDepartureDelayMinutes = Math.round(
    safeNumber(
      input.flightPerformance?.averageDepartureDelayMinutes ??
      input.faa?.departuresDelay,
    ),
  )

  const averageArrivalDelayMinutes = roundNullableNumber(
    input.flightPerformance?.averageArrivalDelayMinutes ??
    input.faa?.arrivalsDelay,
  )

  const departureDelayActive =
    hasPositiveNumber(departurePressurePercent) ||
    hasPositiveNumber(averageDepartureDelayMinutes) ||
    hasPositiveNumber(input.faa?.departuresDelay) ||
    hasFaaEventType(input.faa, ["departure_delay", "ground_delay"])

  const arrivalDelayActive =
    hasPositiveNumber(arrivalPressurePercent) ||
    hasPositiveNumber(averageArrivalDelayMinutes) ||
    hasPositiveNumber(input.faa?.arrivalsDelay) ||
    hasFaaEventType(input.faa, ["arrival_delay"])

  const activeSources: SkysirvAirportPressureSource[] = []

  if (faaScore > 0) activeSources.push("faa")
  if (weatherScore > 0) activeSources.push("weather")
  if (flightPerformanceScore > 0) activeSources.push("flight_performance")

  return {
    iata: input.iata.toUpperCase(),
    pressureScore,
    severity,
    statusLabel: getStatusLabel(severity),
    departurePressurePercent,
    arrivalPressurePercent,
    cancellationPercent,
    averageDepartureDelayMinutes,
    averageArrivalDelayMinutes,
    departureDelayActive,
    arrivalDelayActive,
    primaryReason: getPrimaryReason(input),
    sourceBreakdown: {
      faaScore,
      weatherScore,
      flightPerformanceScore,
      activeSources,
    },
  }
}