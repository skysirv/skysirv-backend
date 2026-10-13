import {
  searchRouteStackFlights,
  type RouteStackFlightItinerary,
  type RouteStackFlightSegment,
} from "./routestack/flights/routestackFlights.js"

import type {
  FlightProvider,
  FlightSearchParams,
  FlightResult,
  FlightSegment,
} from "./types.js"

export class RouteStackAdapter implements FlightProvider {
  private normalizeCode(
    value: string | null | undefined,
  ): string {
    return String(value ?? "")
      .trim()
      .toUpperCase()
  }

  private normalizeFlightNumber(
    value: string | null | undefined,
  ): string {
    return String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
  }

  private normalizeSegment(
    segment: RouteStackFlightSegment,
  ): FlightSegment {
    const carrier =
      this.normalizeCode(
        segment.flightCode,
      )

    const flightNumber =
      this.normalizeFlightNumber(
        segment.flightNumber,
      )

    return {
      origin:
        this.normalizeCode(
          segment.departure,
        ),

      destination:
        this.normalizeCode(
          segment.arrival,
        ),

      marketingCarrier:
        carrier || undefined,

      operatingCarrier:
        carrier || undefined,

      marketingFlightNumber:
        flightNumber || undefined,

      operatingFlightNumber:
        flightNumber || undefined,

      departureTime:
        segment.departureTime,

      arrivalTime:
        segment.arrivalTime,
    }
  }

  private buildFlightNumber(
    segments: RouteStackFlightSegment[],
  ): string {
    return segments
      .map((segment) => {
        const carrier =
          this.normalizeCode(
            segment.flightCode,
          )

        const number =
          this.normalizeFlightNumber(
            segment.flightNumber,
          )

        return `${carrier}${number}`
      })
      .filter(Boolean)
      .join("+")
  }

  private buildItineraryKey(
    segments: FlightSegment[],
  ): string {
    return segments
      .map((segment) =>
        [
          segment.origin,
          segment.destination,
          segment.marketingCarrier ?? "",
          segment.marketingFlightNumber ?? "",
          segment.operatingCarrier ?? "",
          segment.operatingFlightNumber ?? "",
          segment.departureTime ?? "",
        ].join(":"),
      )
      .join("|")
  }

  private getTotalDurationMinutes(
    itinerary: RouteStackFlightItinerary,
  ): number | undefined {
    const segments =
      itinerary.flights ?? []

    if (segments.length === 0) {
      return undefined
    }

    const total =
      segments.reduce(
        (sum, segment) =>
          sum +
          (
            typeof segment.triptime === "number"
              ? segment.triptime
              : 0
          ),
        0,
      )

    return total > 0
      ? total
      : undefined
  }

  private normalizeItinerary(
    itinerary: RouteStackFlightItinerary,
  ): FlightResult | null {
    const rawSegments =
      itinerary.flights ?? []

    if (rawSegments.length === 0) {
      return null
    }

    const first =
      rawSegments[0]

    const carrier =
      this.normalizeCode(
        first?.flightCode,
      )

    const airlineName =
      first?.airline?.trim() || null

    const flightNumber =
      this.buildFlightNumber(
        rawSegments,
      )

    if (
      !carrier ||
      !flightNumber
    ) {
      return null
    }

    const price =
      itinerary.ourprice ??
      itinerary.showOurprice ??
      itinerary.totalFare

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return null
    }

    const segments =
      rawSegments.map(
        (segment) =>
          this.normalizeSegment(
            segment,
          ),
      )

    const firstSegment =
      segments[0]

    const lastSegment =
      segments[
      segments.length - 1
      ]

    return {
      airline: carrier,

      airlineName,

      airlineLogoSymbolUrl: null,
      airlineLogoLockupUrl: null,

      flightNumber,

      departureTime:
        firstSegment?.departureTime,

      arrivalTime:
        lastSegment?.arrivalTime,

      price,

      currency: "USD",

      marketingCarrier:
        firstSegment?.marketingCarrier,

      operatingCarrier:
        firstSegment?.operatingCarrier,

      stopCount:
        typeof itinerary.stops === "number"
          ? itinerary.stops
          : Math.max(
            segments.length - 1,
            0,
          ),

      totalDurationMinutes:
        this.getTotalDurationMinutes(
          itinerary,
        ),

      itineraryKey:
        this.buildItineraryKey(
          segments,
        ),

      segments,
    }
  }

  async searchFlights(
    params: FlightSearchParams,
  ): Promise<FlightResult[]> {
    const departureDate =
      typeof params.departureDate === "string"
        ? params.departureDate.split("T")[0]
        : new Date(
          params.departureDate,
        )
          .toISOString()
          .split("T")[0]

    try {
      const response =
        await searchRouteStackFlights({
          origin:
            this.normalizeCode(
              params.origin,
            ),

          destination:
            this.normalizeCode(
              params.destination,
            ),

          departureDate,

          adults: 1,
          children: 0,
          infants: 0,

          cabin: "Economy",
        })

      const itineraries =
        response.result ?? []

      const results =
        itineraries
          .map((itinerary) =>
            this.normalizeItinerary(
              itinerary,
            ),
          )
          .filter(
            (
              result,
            ): result is FlightResult =>
              result !== null,
          )

      if (results.length === 0) {
        console.log(
          "RouteStack returned no usable offers",
          {
            origin:
              params.origin,
            destination:
              params.destination,
            departureDate,
          },
        )
      }

      return results
    } catch (error) {
      console.error(
        "RouteStack API error:",
        error,
      )

      return []
    }
  }
}