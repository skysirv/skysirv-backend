import type { Kysely } from "kysely"
import type { DB } from "../../db/types.js"
import type { NormalizedPrice } from "./evaluateAlerts.js"

export async function detectPriceChange(
  db: Kysely<DB>,
  routeHash: string,
  current: Pick<NormalizedPrice, "airline" | "flightNumber" | "price">
): Promise<boolean> {
  const last = await db
    .selectFrom("flight_price_history")
    .select(["price"])
    .where("route_hash", "=", routeHash)
    .where("airline", "=", current.airline)
    .where("flight_number", "=", current.flightNumber)
    .orderBy("captured_at", "desc")
    .limit(1)
    .executeTakeFirst()

  if (!last) return true

  return Number(last.price) !== Number(current.price)
}