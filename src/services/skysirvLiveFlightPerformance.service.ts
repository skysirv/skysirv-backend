import { getCiriumAirportDelayIndexes } from "./ciriumDelayIndex.service.js"
import { getFlightAwareAirportDelays } from "./flightAwareAirportDelays.service.js"
import { SkysirvAirportPressureFlightPerformanceSignal } from "./skysirvLiveAirportPressure.service.js"

export type SkysirvLiveFlightPerformanceMap = Map<
  string,
  SkysirvAirportPressureFlightPerformanceSignal
>

function maxNullable(
  first: number | null | undefined,
  second: number | null | undefined,
) {
  if (typeof first === "number" && typeof second === "number") {
    return Math.max(first, second)
  }

  if (typeof first === "number") return first
  if (typeof second === "number") return second

  return null
}

function mergeFlightPerformanceSignals(
  ciriumSignal?: SkysirvAirportPressureFlightPerformanceSignal,
  flightAwareSignal?: SkysirvAirportPressureFlightPerformanceSignal,
): SkysirvAirportPressureFlightPerformanceSignal | null {
  if (ciriumSignal && !flightAwareSignal) return ciriumSignal
  if (!ciriumSignal && flightAwareSignal) return flightAwareSignal
  if (!ciriumSignal || !flightAwareSignal) return null

  return {
    source: "Internal",
    observedAt:
      ciriumSignal.observedAt ??
      flightAwareSignal.observedAt ??
      new Date().toISOString(),
    departureDelayPercent: maxNullable(
      ciriumSignal.departureDelayPercent,
      flightAwareSignal.departureDelayPercent,
    ),
    arrivalDelayPercent: maxNullable(
      ciriumSignal.arrivalDelayPercent,
      flightAwareSignal.arrivalDelayPercent,
    ),
    cancellationPercent: maxNullable(
      ciriumSignal.cancellationPercent,
      flightAwareSignal.cancellationPercent,
    ),
    averageDepartureDelayMinutes: maxNullable(
      ciriumSignal.averageDepartureDelayMinutes,
      flightAwareSignal.averageDepartureDelayMinutes,
    ),
    averageArrivalDelayMinutes: maxNullable(
      ciriumSignal.averageArrivalDelayMinutes,
      flightAwareSignal.averageArrivalDelayMinutes,
    ),
  }
}

/**
 * Production provider aggregation layer for airport-level flight performance.
 *
 * Current providers:
 * - Cirium Delay Index, enabled only when CIRIUM_ENABLED=true and credentials exist.
 * - FlightAware AeroAPI airport delays, enabled only when FLIGHTAWARE_ENABLED=true and credentials exist.
 *
 * Merge behavior:
 * - If only one provider has a signal, use that provider.
 * - If both providers have a signal, keep the stronger pressure values.
 * - FAA still overrides hard operational events inside the pressure engine.
 *
 * Future providers:
 * - OAG
 * - Skysirv internal airport snapshots
 */
export async function getAirportFlightPerformanceSignals(
  airportCodes: string[] = [],
): Promise<SkysirvLiveFlightPerformanceMap> {
  const signals: SkysirvLiveFlightPerformanceMap = new Map()

  const [ciriumResult, flightAwareResult] = await Promise.allSettled([
    getCiriumAirportDelayIndexes(airportCodes),
    getFlightAwareAirportDelays(airportCodes),
  ])

  if (ciriumResult.status === "rejected") {
    console.error("Cirium airport delay provider failed", ciriumResult.reason)
  }

  if (flightAwareResult.status === "rejected") {
    console.error(
      "FlightAware airport delays provider failed",
      flightAwareResult.reason,
    )
  }

  const ciriumSignals =
    ciriumResult.status === "fulfilled" ? ciriumResult.value : new Map()

  const flightAwareSignals =
    flightAwareResult.status === "fulfilled" ? flightAwareResult.value : new Map()

  const airportCodeSet = new Set<string>([
    ...ciriumSignals.keys(),
    ...flightAwareSignals.keys(),
  ])

  for (const airportCode of airportCodeSet) {
    const mergedSignal = mergeFlightPerformanceSignals(
      ciriumSignals.get(airportCode),
      flightAwareSignals.get(airportCode),
    )

    if (!mergedSignal) continue

    signals.set(airportCode, mergedSignal)
  }

  return signals
}