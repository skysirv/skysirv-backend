import { searchBookingOffers } from "../../services/booking/bookingSearchService.js"

import type {
  BookingCabinClass,
  BookingTripType,
  NormalizedBookingOffer,
} from "../../services/booking/types.js"

export type LucyFlightDeparturePeriod =
  | "early_morning"
  | "morning"
  | "afternoon"
  | "evening"
  | "any"

export type LucyFlightSearchInput = {
  tripType: BookingTripType
  origin: string
  destination: string
  departureDate: string
  returnDate?: string | null
  adults?: number
  children?: number
  infants?: number
  cabinClass?: BookingCabinClass
  maxConnections?: number
  airlineIataCode?: string | null
  departurePeriod?: LucyFlightDeparturePeriod
  maxResults?: number
}

function getDepartureHour(
  offer: NormalizedBookingOffer
) {
  const departureTime =
    offer.summary.departureTime

  if (!departureTime) {
    return null
  }

  const match =
    departureTime.match(/T(\d{2}):/)

  if (!match) {
    return null
  }

  return Number(match[1])
}

function matchesDeparturePeriod(
  offer: NormalizedBookingOffer,
  period: LucyFlightDeparturePeriod
) {
  if (period === "any") {
    return true
  }

  const hour = getDepartureHour(offer)

  if (hour === null) {
    return false
  }

  if (period === "early_morning") {
    return hour >= 5 && hour < 8
  }

  if (period === "morning") {
    return hour >= 5 && hour < 12
  }

  if (period === "afternoon") {
    return hour >= 12 && hour < 17
  }

  return hour >= 17 && hour < 24
}

function matchesAirline(
  offer: NormalizedBookingOffer,
  airlineIataCode?: string | null
) {
  const requestedAirline =
    airlineIataCode?.trim().toUpperCase()

  if (!requestedAirline) {
    return true
  }

  if (
    offer.owner.iataCode?.toUpperCase() ===
    requestedAirline
  ) {
    return true
  }

  return offer.slices.some((slice) =>
    slice.segments.some(
      (segment) =>
        segment.airlineIataCode?.toUpperCase() ===
        requestedAirline
    )
  )
}

function getOfferPrice(
  offer: NormalizedBookingOffer
) {
  const value = Number(offer.totalAmount)

  return Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY
}

export async function searchLucyFlights(
  input: LucyFlightSearchInput
) {
  const maxResults = Math.min(
    Math.max(input.maxResults ?? 5, 1),
    8
  )

  const departurePeriod =
    input.departurePeriod ?? "any"

  const result = await searchBookingOffers({
    provider: "duffel",
    tripType: input.tripType,
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    returnDate: input.returnDate ?? null,
    adults: input.adults ?? 1,
    children: input.children ?? 0,
    infants: input.infants ?? 0,
    cabinClass: input.cabinClass ?? "economy",
    maxConnections: input.maxConnections ?? 1,
  })

  const matchingOffers =
    result.offers
      .filter((offer) =>
        matchesAirline(
          offer,
          input.airlineIataCode
        )
      )
      .filter((offer) =>
        matchesDeparturePeriod(
          offer,
          departurePeriod
        )
      )
      .sort(
        (a, b) =>
          getOfferPrice(a) -
          getOfferPrice(b)
      )
      .slice(0, maxResults)

  return {
    provider: result.provider,
    offerRequestId: result.offerRequestId,
    liveMode: result.liveMode,
    offers: matchingOffers.map((offer) => ({
      offerId: offer.id,
      airlineName:
        offer.summary.airlineName,
      airlineIataCode:
        offer.summary.airlineIataCode,
      flightNumber:
        offer.summary.flightNumber,
      departureTime:
        offer.summary.departureTime,
      arrivalTime:
        offer.summary.arrivalTime,
      duration:
        offer.summary.duration,
      stops:
        offer.summary.stops,
      totalAmount:
        offer.totalAmount,
      totalCurrency:
        offer.totalCurrency,
      expiresAt:
        offer.expiresAt,
      slices: offer.slices.map((slice) => ({
        origin:
          slice.origin.iataCode,
        destination:
          slice.destination.iataCode,
        departureTime:
          slice.departureTime,
        arrivalTime:
          slice.arrivalTime,
        duration:
          slice.duration,
        stops:
          slice.stops,
        segments:
          slice.segments.map(
            (segment) => ({
              airlineName:
                segment.airlineName,
              airlineIataCode:
                segment.airlineIataCode,
              flightNumber:
                segment.flightNumber,
              origin:
                segment.origin.iataCode,
              destination:
                segment.destination.iataCode,
              departingAt:
                segment.departingAt,
              arrivingAt:
                segment.arrivingAt,
              duration:
                segment.duration,
              aircraft:
                segment.aircraft,
            })
          ),
      })),
    })),
  }
}