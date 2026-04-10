import { Duffel } from "@duffel/api"
import { FlightProvider, FlightSearchParams, FlightResult } from "./types.js"

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
    return String(value ?? "").trim().toUpperCase()
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
      if (b.operatingCount !== a.operatingCount) {
        return b.operatingCount - a.operatingCount
      }

      if (b.marketingCount !== a.marketingCount) {
        return b.marketingCount - a.marketingCount
      }

      return a.firstSeenIndex - b.firstSeenIndex
    })

    return ranked[0]?.code ?? null
  }

  private getFlightNumberForCarrier(
    segments: DuffelSegment[],
    carrierCode: string
  ): string | null {
    for (const segment of segments) {
      const operating = this.normalizeCode(segment.operating_carrier?.iata_code)
      const marketing = this.normalizeCode(segment.marketing_carrier?.iata_code)

      const operatingFlightNumber = this.normalizeFlightNumber(
        segment.operating_carrier_flight_number
      )
      const marketingFlightNumber = this.normalizeFlightNumber(
        segment.marketing_carrier_flight_number
      )

      if (
        operating === carrierCode &&
        this.isUsableFlightNumber(operatingFlightNumber)
      ) {
        return operatingFlightNumber
      }

      if (
        marketing === carrierCode &&
        this.isUsableFlightNumber(marketingFlightNumber)
      ) {
        return marketingFlightNumber
      }

      if (
        (operating === carrierCode || marketing === carrierCode) &&
        this.isUsableFlightNumber(operatingFlightNumber)
      ) {
        return operatingFlightNumber
      }
    }

    return null
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

      const operating = this.normalizeCode(segment.operating_carrier?.iata_code)
      const marketing = this.normalizeCode(segment.marketing_carrier?.iata_code)

      if (
        !this.isUsableCarrierCode(operating) &&
        !this.isUsableCarrierCode(marketing)
      ) {
        return false
      }
    }

    return true
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
        const segments = slice?.segments ?? []

        if (!this.isRealisticItinerary(segments)) {
          console.log("Duffel skipped unrealistic itinerary", {
            origin: params.origin,
            destination: params.destination,
            segments,
          })
          continue
        }

        const dominantCarrier = this.chooseDominantCarrier(segments)

        if (!dominantCarrier) {
          console.log("Duffel skipped offer with no dominant carrier", {
            origin: params.origin,
            destination: params.destination,
            segments,
          })
          continue
        }

        const chosenFlightNumber = this.getFlightNumberForCarrier(
          segments,
          dominantCarrier
        )

        if (!chosenFlightNumber) {
          console.log("Duffel skipped offer with no usable flight number", {
            dominantCarrier,
            segments,
          })
          continue
        }

        const firstSegment = segments[0]
        const lastSegment = segments[segments.length - 1]
        const totalPrice = Number(offer.total_amount ?? 0)

        if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
          continue
        }

        results.push({
          airline: dominantCarrier,
          flightNumber: chosenFlightNumber,
          departureTime: firstSegment?.departing_at,
          arrivalTime: lastSegment?.arriving_at,
          price: totalPrice,
          currency: offer.total_currency ?? "USD",
        })
      }

      return results
    } catch (err) {
      console.error("Duffel API error:", err)
      return []
    }
  }
}