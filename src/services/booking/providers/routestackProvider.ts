import { searchRouteStackFlights } from "../../../providers/routestack/flights/routestackFlights.js"

import type {
  BookingSearchResult,
  NormalizedBookingOffer,
  NormalizedBookingSlice,
  ProviderSearchInput,
} from "../types.js"

import type {
  RouteStackFlightItinerary,
  RouteStackFlightSegment,
} from "../../../providers/routestack/flights/routestackFlights.js"

function normalizeIataCode(value: string) {
  return value.trim().toUpperCase()
}

function mapCabinClass(
  cabinClass: ProviderSearchInput["cabinClass"]
) {
  if (cabinClass === "premium_economy") {
    return "Premium"
  }

  if (cabinClass === "business") {
    return "Business"
  }

  if (cabinClass === "first") {
    return "First"
  }

  return "Economy"
}

function formatDuration(minutes?: number | null) {
  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes)
  ) {
    return null
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(
    minutes % 60
  )

  return `PT${hours}H${remainingMinutes}M`
}

function normalizeSegment(
  segment: RouteStackFlightSegment,
  index: number
) {
  return {
    id: `${segment.flightCode ?? "XX"}-${segment.flightNumber ?? index
      }-${segment.departureTime ?? index}`,
    airlineName:
      segment.airline ?? null,
    airlineIataCode:
      segment.flightCode ?? null,
    airlineLogoSymbolUrl: null,
    airlineLogoLockupUrl: null,
    flightNumber:
      segment.flightNumber ?? null,
    origin: {
      iataCode:
        segment.departure ?? null,
      name:
        segment.departairport ?? null,
      cityName:
        segment.departurelocation ?? null,
    },
    destination: {
      iataCode:
        segment.arrival ?? null,
      name:
        segment.arrivalairport ?? null,
      cityName:
        segment.arrivallocation ?? null,
    },
    departingAt:
      segment.departureTime ?? null,
    arrivingAt:
      segment.arrivalTime ?? null,
    duration:
      formatDuration(segment.triptime),
    aircraft: null,
  }
}

function buildSlices(
  itinerary: RouteStackFlightItinerary
): NormalizedBookingSlice[] {
  const segments =
    itinerary.flights ?? []

  const grouped = new Map<
    number,
    RouteStackFlightSegment[]
  >()

  for (const segment of segments) {
    const legIndex =
      typeof segment.legindicator === "number"
        ? segment.legindicator
        : 0

    const existing =
      grouped.get(legIndex) ?? []

    existing.push(segment)
    grouped.set(legIndex, existing)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([legIndex, legSegments]) => {
      const first =
        legSegments[0] ?? null
      const last =
        legSegments[
        legSegments.length - 1
        ] ?? null

      const totalMinutes =
        legSegments.reduce(
          (sum, segment) =>
            sum +
            (segment.triptime ?? 0),
          0
        )

      return {
        id: `leg-${legIndex}`,
        duration:
          formatDuration(totalMinutes),
        origin: {
          iataCode:
            first?.departure ?? null,
          name:
            first?.departairport ?? null,
          cityName:
            first?.departurelocation ??
            null,
        },
        destination: {
          iataCode:
            last?.arrival ?? null,
          name:
            last?.arrivalairport ?? null,
          cityName:
            last?.arrivallocation ?? null,
        },
        departureTime:
          first?.departureTime ?? null,
        arrivalTime:
          last?.arrivalTime ?? null,
        stops: Math.max(
          0,
          legSegments.length - 1
        ),
        segments: legSegments.map(
          normalizeSegment
        ),
      }
    })
}

function normalizeOffer(
  itinerary: RouteStackFlightItinerary,
  currency: string
): NormalizedBookingOffer {
  const slices =
    buildSlices(itinerary)

  const firstSlice =
    slices[0] ?? null

  const firstSegment =
    firstSlice?.segments[0] ?? null

  const lastSegment =
    firstSlice?.segments[
    firstSlice.segments.length - 1
    ] ?? null

  const totalAmount =
    itinerary.ourprice ??
    itinerary.showOurprice ??
    itinerary.totalFare ??
    0

  return {
    id: itinerary.fareSourceCode,
    provider: "routestack",
    owner: {
      id:
        firstSegment?.airlineIataCode ??
        null,
      name:
        firstSegment?.airlineName ??
        null,
      iataCode:
        firstSegment?.airlineIataCode ??
        null,
    },
    totalAmount:
      String(totalAmount),
    totalCurrency: currency,
    baseAmount:
      itinerary.baseFare !== undefined
        ? String(itinerary.baseFare)
        : null,
    taxAmount:
      itinerary.taxes !== undefined
        ? String(itinerary.taxes)
        : null,
    expiresAt: null,
    liveMode: true,
    slices,
    summary: {
      airlineName:
        firstSegment?.airlineName ??
        "Unknown airline",
      airlineIataCode:
        firstSegment?.airlineIataCode ??
        null,
      airlineLogoSymbolUrl: null,
      airlineLogoLockupUrl: null,
      flightNumber:
        firstSegment?.flightNumber ??
        null,
      departureTime:
        firstSlice?.departureTime ??
        null,
      arrivalTime:
        firstSlice?.arrivalTime ??
        null,
      duration:
        firstSlice?.duration ?? null,
      stops:
        firstSlice?.stops ?? 0,
    },
  }
}

export async function searchRouteStackBookingOffers(
  input: ProviderSearchInput
): Promise<BookingSearchResult> {
  if (input.slices.length === 0) {
    throw new Error(
      "At least one flight slice is required"
    )
  }

  if (input.slices.length > 2) {
    throw new Error(
      "RouteStack multi-city booking search is not yet enabled"
    )
  }

  const outbound = input.slices[0]
  const inbound = input.slices[1]

  const response =
    await searchRouteStackFlights({
      origin: normalizeIataCode(
        outbound.origin
      ),
      destination: normalizeIataCode(
        outbound.destination
      ),
      departureDate:
        outbound.departureDate,
      returnDate:
        inbound?.departureDate,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      cabin: mapCabinClass(
        input.cabinClass
      ),
      maxConnections:
        input.maxConnections,
    })

  const currency =
    response.currency ?? "USD"

  const offers =
    (response.result ?? []).map(
      (itinerary) =>
        normalizeOffer(
          itinerary,
          currency
        )
    )

  return {
    provider: "routestack",
    offerRequestId:
      response.alphaSessionId ??
      response.correlationId ??
      `routestack-${Date.now()}`,
    liveMode: true,
    passengerIds: [],
    offers,
  }
}