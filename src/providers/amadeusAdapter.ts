import { FlightProvider, FlightSearchParams, FlightResult } from "./types.js"

type AmadeusSegment = {
  carrierCode?: string
  number?: string
  departure?: { at?: string; iataCode?: string }
  arrival?: { at?: string; iataCode?: string }
  operating?: {
    carrierCode?: string
  }
}

type AmadeusItinerary = {
  segments?: AmadeusSegment[]
}

type CarrierStats = {
  code: string
  operatingCount: number
  marketingCount: number
  firstSeenIndex: number
}

export class AmadeusAdapter implements FlightProvider {
  private accessToken: string | null = null
  private tokenExpiry = 0

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

  private buildCarrierStats(segments: AmadeusSegment[]): Map<string, CarrierStats> {
    const stats = new Map<string, CarrierStats>()

    segments.forEach((segment, index) => {
      const operating = this.normalizeCode(segment.operating?.carrierCode)
      const marketing = this.normalizeCode(segment.carrierCode)

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

  private chooseDominantCarrier(segments: AmadeusSegment[]): string | null {
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
    segments: AmadeusSegment[],
    carrierCode: string
  ): string | null {
    for (const segment of segments) {
      const operating = this.normalizeCode(segment.operating?.carrierCode)
      const marketing = this.normalizeCode(segment.carrierCode)
      const flightNumber = this.normalizeFlightNumber(segment.number)

      if (!this.isUsableFlightNumber(flightNumber)) continue

      if (operating === carrierCode || marketing === carrierCode) {
        return flightNumber
      }
    }

    return null
  }

  private isRealisticItinerary(segments: AmadeusSegment[]): boolean {
    if (!segments.length) return false

    for (const segment of segments) {
      const departureCode = this.normalizeCode(segment.departure?.iataCode)
      const arrivalCode = this.normalizeCode(segment.arrival?.iataCode)

      if (!departureCode || !arrivalCode) {
        return false
      }

      if (departureCode === arrivalCode) {
        return false
      }

      const operating = this.normalizeCode(segment.operating?.carrierCode)
      const marketing = this.normalizeCode(segment.carrierCode)

      if (
        !this.isUsableCarrierCode(operating) &&
        !this.isUsableCarrierCode(marketing)
      ) {
        return false
      }
    }

    return true
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const clientId = process.env.AMADEUS_CLIENT_ID
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET
    const baseUrl =
      process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com"

    if (!clientId || !clientSecret) {
      throw new Error("Missing Amadeus credentials in environment variables")
    }

    const res = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error("Amadeus token error:", data)
      throw new Error("Failed to obtain Amadeus access token")
    }

    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000

    return this.accessToken as string
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightResult[]> {
    const token = await this.getAccessToken()

    const baseUrl =
      process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com"

    const departureDate =
      typeof params.departureDate === "string"
        ? params.departureDate.split("T")[0]
        : new Date(params.departureDate).toISOString().split("T")[0]

    const query = new URLSearchParams({
      originLocationCode: params.origin,
      destinationLocationCode: params.destination,
      departureDate,
      adults: "1",
      currencyCode: "USD",
      max: "10",
    })

    const url = `${baseUrl}/v2/shopping/flight-offers?${query.toString()}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json()

    if (!res.ok) {
      console.error("Amadeus API error:", data)
      return []
    }

    if (!data?.data || data.data.length === 0) {
      console.log("Amadeus returned no flights", {
        origin: params.origin,
        destination: params.destination,
        departureDate: params.departureDate,
      })
      return []
    }

    const results: FlightResult[] = []

    for (const offer of data.data) {
      const itinerary = offer.itineraries?.[0] as AmadeusItinerary | undefined
      const segments = itinerary?.segments ?? []

      if (!this.isRealisticItinerary(segments)) {
        console.log("Amadeus skipped unrealistic itinerary", {
          origin: params.origin,
          destination: params.destination,
          segments,
        })
        continue
      }

      const dominantCarrier = this.chooseDominantCarrier(segments)

      if (!dominantCarrier) {
        console.log("Amadeus skipped offer with no dominant carrier", {
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
        console.log("Amadeus skipped offer with no usable flight number", {
          dominantCarrier,
          segments,
        })
        continue
      }

      const firstSegment = segments[0]
      const lastSegment = segments[segments.length - 1]
      const totalPrice = Number(offer.price?.total ?? 0)

      if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
        continue
      }

      results.push({
        airline: dominantCarrier,
        flightNumber: chosenFlightNumber,
        departureTime: firstSegment?.departure?.at,
        arrivalTime: lastSegment?.arrival?.at,
        price: totalPrice,
        currency: offer.price?.currency ?? "USD",
      })
    }

    return results
  }
}