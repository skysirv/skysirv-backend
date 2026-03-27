import { db } from "./index.js";

export async function insertPriceHistory(
  routeHash: string,
  origin: string,
  destination: string,
  departureDate: string,
  airline: string,
  flightNumber: string,
  price: number,
  currency: string,
  skyscore: number | null = null,
  bookingSignal: string | null = null,
  volatilityIndex: string | null = null
) {
  return db
    .insertInto("flight_price_history")
    .values({
      route_hash: routeHash,
      origin,
      destination,
      departure_date: new Date(departureDate),
      airline,
      flight_number: flightNumber,
      price,
      currency,

      // Phase 6 intelligence persistence
      skyscore: skyscore,
      booking_signal: bookingSignal,
      volatility_index: volatilityIndex,
    })
    .execute();
}