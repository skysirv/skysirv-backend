import { Duffel } from "@duffel/api"
import { FlightProvider, FlightSearchParams, FlightResult, FlightSegment } from "./types.js"

type DuffelSegment = {
  departing_at?: string
  arriving_at?: string
  origin?: { iata_code?: string }
  destination?: { iata_code?: string }
  marketing_carrier?: { iata_code?: string }
  operating_carrier?: { iata_code?: string }
  marketing_carrier_flight_number?: string
  operating_carrier_flight_number?: string
}

type DuffelSlice = {
  segments?: DuffelSegment[]
  duration?: string
}

type CarrierStats = {
  code: string
  operatingCount: number
  marketingCount: number
  firstSeenIndex: number
}

export class DuffelAdapter implements FlightProvider {
  private client: Duffel

  constructor() {
    const apiKey = process.env.DUFFEL_API_KEY

    if (!apiKey) {
      throw new Error("Missing DUFFEL_API_KEY in environment variables")
    }

    this.client = new Duffel({
      token: apiKey,
    })
  }

  private normalizeCode(value: string | null | undefined): string {
    return String(value ?? "").trim().toUpperCase()
  }

  private normalizeFlightNumber(value: string | null | undefined): string {
    return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "")
  }

  private isUsableCarrierCode(value: string | null | undefined): boolean {
    const code = this.normalizeCode(value)

    if (!code) return false

    const blocked = new Set([
      "UNK",
      "UNKNOWN",
      "XX",
      "YY",
      "N/A",
      "NA",
      "NULL",
      "UNDEFINED",
      "--",
      "?",
    ])

    return !blocked.has(code) && /^[A-Z0-9]{2,3}$/.test(code)
  }

  private isUsableFlightNumber(value: string | null | undefined): boolean {
    const flightNumber = this.normalizeFlightNumber(value)
    return /^[A-Z0-9-]{1,10}$/.test(flightNumber)
  }

  private getPreferredSegmentIdentity(segment: DuffelSegment): {
    airline: string
    flightNumber: string
  } | null {
    const marketingCarrier = this.normalizeCode(segment.marketing_carrier?.iata_code)
    const operatingCarrier = this.normalizeCode(segment.operating_carrier?.iata_code)

    const marketingFlightNumber = this.normalizeFlightNumber(
      segment.marketing_carrier_flight_number
    )
    const operatingFlightNumber = this.normalizeFlightNumber(
      segment.operating_carrier_flight_number
    )

    if (
      this.isUsableCarrierCode(marketingCarrier) &&
      this.isUsableFlightNumber(marketingFlightNumber)
    ) {
      return {
        airline: marketingCarrier,
        flightNumber: marketingFlightNumber,
      }
    }

    if (
      this.isUsableCarrierCode(operatingCarrier) &&
      this.isUsableFlightNumber(operatingFlightNumber)
    ) {
      return {
        airline: operatingCarrier,
        flightNumber: operatingFlightNumber,
      }
    }

    return null
  }

  private buildCarrierStats(segments: DuffelSegment[]): Map<string, CarrierStats> {
    const stats = new Map<string, CarrierStats>()

    segments.forEach((segment, index) => {
      const operating = this.normalizeCode(segment.operating_carrier?.iata_code)
      const marketing = this.normalizeCode(segment.marketing_carrier?.iata_code)

      if (this.isUsableCarrierCode(operating)) {
        const existing = stats.get(operating)
        if (existing) {
          existing.operatingCount += 1
        } else {
          stats.set(operating, {
            code: operating,
            operatingCount: 1,
            marketingCount: 0,
            firstSeenIndex: index,
          })
        }
      }

      if (this.isUsableCarrierCode(marketing)) {
        const existing = stats.get(marketing)
        if (existing) {
          existing.marketingCount += 1
        } else {
          stats.set(marketing, {
            code: marketing,
            operatingCount: 0,
            marketingCount: 1,
            firstSeenIndex: index,
          })
        }
      }
    })

    return stats
  }

  private chooseDominantCarrier(segments: DuffelSegment[]): string | null {
    const stats = this.buildCarrierStats(segments)
    const ranked = Array.from(stats.values()).sort((a, b) => {
      if (b.marketingCount !== a.marketingCount) {
        return b.marketingCount - a.marketingCount
      }

      if (b.operatingCount !== a.operatingCount) {
        return b.operatingCount - a.operatingCount
      }

      return a.firstSeenIndex - b.firstSeenIndex
    })

    return ranked[0]?.code ?? null
  }

  private normalizeSegments(segments: DuffelSegment[]): FlightSegment[] {
    return segments.map((segment) => ({
      origin: this.normalizeCode(segment.origin?.iata_code),
      destination: this.normalizeCode(segment.destination?.iata_code),
      marketingCarrier: this.isUsableCarrierCode(segment.marketing_carrier?.iata_code)
        ? this.normalizeCode(segment.marketing_carrier?.iata_code)
        : undefined,
      operatingCarrier: this.isUsableCarrierCode(segment.operating_carrier?.iata_code)
        ? this.normalizeCode(segment.operating_carrier?.iata_code)
        : undefined,
      marketingFlightNumber: this.isUsableFlightNumber(
        segment.marketing_carrier_flight_number
      )
        ? this.normalizeFlightNumber(segment.marketing_carrier_flight_number)
        : undefined,
      operatingFlightNumber: this.isUsableFlightNumber(
        segment.operating_carrier_flight_number
      )
        ? this.normalizeFlightNumber(segment.operating_carrier_flight_number)
        : undefined,
      departureTime: segment.departing_at,
      arrivalTime: segment.arriving_at,
    }))
  }

  private isRealisticItinerary(segments: DuffelSegment[]): boolean {
    if (!segments.length) return false

    for (const segment of segments) {
      const origin = this.normalizeCode(segment.origin?.iata_code)
      const destination = this.normalizeCode(segment.destination?.iata_code)

      if (!origin || !destination) {
        return false
      }

      if (origin === destination) {
        return false
      }

      const identity = this.getPreferredSegmentIdentity(segment)

      if (!identity) {
        return false
      }
    }

    return true
  }

  private getRepresentativeFlightNumber(segments: DuffelSegment[]): string | null {
    const segmentLabels = segments
      .map((segment) => {
        const identity = this.getPreferredSegmentIdentity(segment)

        if (!identity) return null

        return `${identity.airline}${identity.flightNumber}`
      })
      .filter((value): value is string => Boolean(value))

    if (!segmentLabels.length) return null

    return segmentLabels.join("+")
  }

  private buildItineraryKey(segments: FlightSegment[]): string {
    return segments
      .map((segment) => {
        const marketingCarrier = segment.marketingCarrier ?? ""
        const operatingCarrier = segment.operatingCarrier ?? ""
        const marketingFlightNumber = segment.marketingFlightNumber ?? ""
        const operatingFlightNumber = segment.operatingFlightNumber ?? ""

        return [
          segment.origin,
          segment.destination,
          marketingCarrier,
          marketingFlightNumber,
          operatingCarrier,
          operatingFlightNumber,
          segment.departureTime ?? "",
        ].join(":")
      })
      .join("|")
  }

  private parseDurationMinutes(value: string | null | undefined): number | undefined {
    if (!value) return undefined

    const match = value.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?$/)

    if (!match) return undefined

    const hours = Number(match[1] ?? 0)
    const minutes = Number(match[2] ?? 0)

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return undefined
    }

    return hours * 60 + minutes
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightResult[]> {
    const departureDate =
      typeof params.departureDate === "string"
        ? params.departureDate.split("T")[0]
        : new Date(params.departureDate).toISOString().split("T")[0]

    try {
      const offerRequest = await (this.client.offerRequests as any).create({
        slices: [
          {
            origin: params.origin,
            destination: params.destination,
            departure_date: departureDate,
          },
        ],
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
      })

      const offers = (offerRequest as any).data?.offers ?? []

      if (!offers.length) {
        console.log("Duffel returned no offers", {
          origin: params.origin,
          destination: params.destination,
          departureDate,
        })

        return []
      }

      const results: FlightResult[] = []

      for (const offer of offers) {
        const slice = offer.slices?.[0] as DuffelSlice | undefined
        const rawSegments = slice?.segments ?? []

        if (!this.isRealisticItinerary(rawSegments)) {
          console.log("Duffel skipped unrealistic itinerary", {
            origin: params.origin,
            destination: params.destination,
            segments: rawSegments,
          })
          continue
        }

        const normalizedSegments = this.normalizeSegments(rawSegments)

        const firstSegment = normalizedSegments[0]
        const lastSegment = normalizedSegments[normalizedSegments.length - 1]

        if (
          firstSegment?.origin !== this.normalizeCode(params.origin) ||
          lastSegment?.destination !== this.normalizeCode(params.destination)
        ) {
          console.log("Duffel skipped itinerary that does not match requested route endpoints", {
            requestedOrigin: params.origin,
            requestedDestination: params.destination,
            firstSegment,
            lastSegment,
          })
          continue
        }

        const dominantCarrier = this.chooseDominantCarrier(rawSegments)
        const representativeFlightNumber =
          this.getRepresentativeFlightNumber(rawSegments)

        if (!dominantCarrier || !representativeFlightNumber) {
          console.log("Duffel skipped offer with no verified itinerary identity", {
            origin: params.origin,
            destination: params.destination,
            segments: rawSegments,
          })
          continue
        }

        const totalPrice = Number(offer.total_amount ?? 0)

        if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
          continue
        }

        results.push({
          airline: dominantCarrier,
          flightNumber: representativeFlightNumber,
          departureTime: firstSegment?.departureTime,
          arrivalTime: lastSegment?.arrivalTime,
          price: totalPrice,
          currency: offer.total_currency ?? "USD",
          marketingCarrier: firstSegment?.marketingCarrier,
          operatingCarrier: firstSegment?.operatingCarrier,
          stopCount: Math.max(normalizedSegments.length - 1, 0),
          totalDurationMinutes: this.parseDurationMinutes(slice?.duration),
          itineraryKey: this.buildItineraryKey(normalizedSegments),
          segments: normalizedSegments,
        })
      }

      return results
    } catch (err) {
      console.error("Duffel API error:", err)
      return []
    }
  }
}