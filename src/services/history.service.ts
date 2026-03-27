import { db } from "../db/index.js"

export async function getRouteHistory(routeHash: string) {
  return db
    .selectFrom("flight_price_history")
    .selectAll()
    .where("route_hash", "=", routeHash)
    .orderBy("captured_at", "desc")
    .execute()
}