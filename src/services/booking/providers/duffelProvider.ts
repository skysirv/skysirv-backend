import { env } from "../../../config/env.js"
import type {
  BookingSearchResult,
  NormalizedBookingOffer,
  ProviderSearchInput,
} from "../types.js"

type DuffelPassenger = {
  type: "adult" | "child" | "infant_without_seat"
}

function normalizeIataCode(value: string) {
  return value.trim().toUpperCase()
}

function buildPassengers({
  adults,
  children,
  infants,
}: {
  adults: number
  children: number
  infants: number
}): DuffelPassenger[] {
  return [
    ...Array.from({ length: Math.max(1, adults) }, () => ({
      type: "adult" as const,
    })),
    ...Array.from({ length: Math.max(0, children) }, () => ({
      type: "child" as const,
    })),
    ...Array.from({ length: Math.max(0, infants) }, () => ({
      type: "infant_without_seat" as const,
    })),
  ]
}

function getFirstSegment(slice: any) {
  return slice?.segments?.[0] ?? null
}

function getLastSegment(slice: any) {
  const segments = slice?.segments ?? []
  return segments.length > 0 ? segments[segments.length - 1] : null
}

function normalizeAirport(airport: any) {
  return {
    iataCode: airport?.iata_code ?? null,
    name: airport?.name ?? null,
    cityName: airport?.city_name ?? null,
  }
}

function normalizeOffer(offer: any): NormalizedBookingOffer {
  const firstSlice = offer.slices?.[0] ?? null
  const firstSegment = getFirstSegment(firstSlice)
  const lastSegment = getLastSegment(firstSlice)

  return {
    id: offer.id,
    provider: "duffel",
    owner: {
      id: offer.owner?.id ?? null,
      name: offer.owner?.name ?? null,
      iataCode: offer.owner?.iata_code ?? null,
    },
    totalAmount: offer.total_amount,
    totalCurrency: offer.total_currency,
    baseAmount: offer.base_amount ?? null,
    taxAmount: offer.tax_amount ?? null,
    expiresAt: offer.expires_at ?? null,
    liveMode: offer.live_mode ?? null,
    slices: (offer.slices ?? []).map((slice: any) => ({
      id: slice.id,
      duration: slice.duration ?? null,
      origin: normalizeAirport(slice.origin),
      destination: normalizeAirport(slice.destination),
      departureTime: getFirstSegment(slice)?.departing_at ?? null,
      arrivalTime: getLastSegment(slice)?.arriving_at ?? null,
      stops: Math.max(0, (slice.segments?.length ?? 1) - 1),
      segments: (slice.segments ?? []).map((segment: any) => ({
        id: segment.id,
        airlineName: segment.marketing_carrier?.name ?? null,
        airlineIataCode: segment.marketing_carrier?.iata_code ?? null,
        flightNumber: segment.marketing_carrier_flight_number ?? null,
        origin: normalizeAirport(segment.origin),
        destination: normalizeAirport(segment.destination),
        departingAt: segment.departing_at ?? null,
        arrivingAt: segment.arriving_at ?? null,
        duration: segment.duration ?? null,
        aircraft: segment.aircraft?.name ?? null,
      })),
    })),
    summary: {
      airlineName:
        firstSegment?.marketing_carrier?.name ??
        offer.owner?.name ??
        "Unknown airline",
      airlineIataCode:
        firstSegment?.marketing_carrier?.iata_code ??
        offer.owner?.iata_code ??
        null,
      flightNumber: firstSegment?.marketing_carrier_flight_number ?? null,
      departureTime: firstSegment?.departing_at ?? null,
      arrivalTime: lastSegment?.arriving_at ?? null,
      duration: firstSlice?.duration ?? null,
      stops: Math.max(0, (firstSlice?.segments?.length ?? 1) - 1),
    },
  }
}

export async function searchDuffelOffers(
  input: ProviderSearchInput
): Promise<BookingSearchResult> {
  if (!env.DUFFEL_ACCESS_TOKEN) {
    throw new Error("DUFFEL_ACCESS_TOKEN is not configured")
  }

  const payload = {
    data: {
      slices: input.slices.map((slice) => ({
        origin: normalizeIataCode(slice.origin),
        destination: normalizeIataCode(slice.destination),
        departure_date: slice.departureDate,
      })),
      passengers: buildPassengers({
        adults: input.adults,
        children: input.children,
        infants: input.infants,
      }),
      cabin_class: input.cabinClass,
      max_connections: input.maxConnections,
    },
  }

  const response = await fetch(
    `${env.DUFFEL_API_BASE_URL}/air/offer_requests?return_offers=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Duffel-Version": env.DUFFEL_API_VERSION,
      },
      body: JSON.stringify(payload),
    }
  )

  const json = await response.json()

  if (!response.ok) {
    const requestId =
      response.headers.get("Duffel-Request-Id") ??
      response.headers.get("request-id") ??
      null

    throw new Error(
      JSON.stringify({
        message: "Duffel offer request failed",
        status: response.status,
        requestId,
        error: json,
      })
    )
  }

  const offerRequest = json.data

  return {
    provider: "duffel",
    offerRequestId: offerRequest.id,
    liveMode: offerRequest.live_mode,
    passengerIds:
      offerRequest.passengers?.map((passenger: any) => passenger.id) ?? [],
    offers: (offerRequest.offers ?? []).map(normalizeOffer),
  }
}