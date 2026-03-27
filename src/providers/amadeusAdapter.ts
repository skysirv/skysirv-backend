import { FlightProvider, FlightSearchParams, FlightResult } from "./types.js"

export class AmadeusAdapter implements FlightProvider {

  private accessToken: string | null = null
  private tokenExpiry = 0

  /**
   * Fetch OAuth token from Amadeus
   */
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
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret
      })
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

  /**
   * Search flights using Amadeus Flight Offers API
   */
  async searchFlights(
    params: FlightSearchParams
  ): Promise<FlightResult[]> {

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
      max: "10"
    })

    const url = `${baseUrl}/v2/shopping/flight-offers?${query.toString()}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
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
        departureDate: params.departureDate
      })
      return []
    }

    const results: FlightResult[] = []

    for (const offer of data.data) {

      const itinerary = offer.itineraries?.[0]
      const segment = itinerary?.segments?.[0]

      if (!segment) continue

      results.push({
        airline: segment.carrierCode,
        flightNumber: segment.number,
        departureTime: segment.departure?.at,
        arrivalTime: segment.arrival?.at,
        price: Number(offer.price?.total ?? 0),
        currency: offer.price?.currency ?? "USD"
      })
    }

    return results
  }
}