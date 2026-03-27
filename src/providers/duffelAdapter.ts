import { Duffel } from "@duffel/api"
import { FlightProvider, FlightSearchParams, FlightResult } from "./types.js"

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

  async searchFlights(
    params: FlightSearchParams
  ): Promise<FlightResult[]> {

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
            departure_date: departureDate
          }
        ],
        passengers: [
          { type: "adult"}
        ],
        cabin_class: "economy"
      })

      const offers = (offerRequest as any).data?.offers ?? []

      if (!offers.length) {

        console.log("Duffel returned no offers", {
          origin: params.origin,
          destination: params.destination,
          departureDate
        })

        return []
      }

      const results: FlightResult[] = []

      for (const offer of offers) {

        const slice = offer.slices?.[0]
        const segment = slice?.segments?.[0]

        if (!segment) continue

        results.push({
          airline: segment.operating_carrier?.iata_code ?? "UNK",
          flightNumber: segment.operating_carrier_flight_number ?? "0",
          departureTime: segment.departing_at,
          arrivalTime: segment.arriving_at,
          price: Number(offer.total_amount ?? 0),
          currency: offer.total_currency ?? "USD"
        })
      }

      return results

    } catch (err) {

      console.error("Duffel API error:", err)

      return []
    }
  }
}