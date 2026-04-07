import { db } from "../db/index.js"

export async function getRouteHistory(routeHash: string) {
  return db
    .selectFrom("flight_price_history")
    .select([
      "id",
      "route_hash",
      "origin",
      "destination",
      "departure_date",
      "airline",
      "flight_number",
      "currency",
      "captured_at",
      "skyscore",
      "booking_signal",
      "volatility_index",
      (eb) => eb("price", "/", 100).as("price"),
    ])
    .where("route_hash", "=", routeHash)
    .orderBy("captured_at", "desc")
    .execute()
}