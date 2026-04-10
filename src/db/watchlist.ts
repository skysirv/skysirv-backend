import { db } from "./index.js"
import { sql } from "kysely"
import { createHash } from "crypto"

function generateRouteHash(
  origin: string,
  destination: string,
  departureDate: string
): string {
  const normalizedOrigin = origin.trim().toLowerCase()
  const normalizedDestination = destination.trim().toLowerCase()

  const date = new Date(departureDate)
  const isoDate = date.toISOString().split("T")[0]

  const canonical = `${normalizedOrigin}-${normalizedDestination}-${isoDate}`

  return createHash("sha256").update(canonical).digest("hex")
}

export async function addToWatchlist(
  userId: string,
  origin: string,
  destination: string,
  departureDate: string
) {
  const routeHash = generateRouteHash(origin, destination, departureDate)

  /*
  --------------------------------
  Prevent duplicate watchlist routes
  --------------------------------
  */

  const existing = await db
    .selectFrom("watchlist")
    .selectAll()
    .where("user_id", "=", userId)
    .where("route_hash", "=", routeHash)
    .executeTakeFirst()

  if (existing) {
    return existing
  }

  /*
  --------------------------------
  Insert new watchlist route
  --------------------------------
  */

  return db
    .insertInto("watchlist")
    .values({
      user_id: userId,
      route_hash: routeHash,
      origin,
      destination,
      departure_date: new Date(departureDate),
      is_active: true,
      created_at: new Date(),
      last_checked_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function getUserWatchlist(userId: string) {
  const latestPerRoute = db
    .selectFrom("flight_price_history")
    .select(({ fn }) => [
      "route_hash",
      fn.max("captured_at").as("latest_captured_at"),
    ])
    .groupBy("route_hash")
    .as("latest_per_route")

  return db
    .selectFrom("watchlist as w")
    .leftJoin(latestPerRoute, "latest_per_route.route_hash", "w.route_hash")
    .leftJoin(
      db
        .selectFrom("flight_price_history as f")
        .selectAll()
        .distinctOn(["f.route_hash"])
        .orderBy("f.route_hash")
        .orderBy("f.captured_at", "desc")
        .as("f"),
      (join) =>
        join.onRef("f.route_hash", "=", "w.route_hash")
    )
    .select([
      "w.id",
      "w.user_id",
      "w.route_hash",
      "w.origin",
      "w.destination",
      "w.departure_date",
      "w.is_active",
      "w.created_at",
      "w.last_checked_at",
      (eb) => eb("f.price", "/", 100).as("latest_price"),
      "f.airline as latest_airline",
      "f.flight_number as latest_flight_number",
      "f.captured_at as latest_captured_at",
      (eb) =>
        eb
          .selectFrom("flight_price_history as rf")
          .select((eb2) =>
            eb2.fn
              .jsonAgg(
                sql`json_build_object(
                  'airline', rf.airline,
                  'flightNumber', rf.flight_number,
                  'price', rf.price / 100.0,
                  'currency', rf.currency,
                  'capturedAt', rf.captured_at
                )`
              )
              .as("recommended_flights")
          )
          .whereRef("rf.route_hash", "=", "w.route_hash")
          .whereRef("rf.captured_at", "=", "latest_per_route.latest_captured_at")
          .as("recommended_flights"),
      (eb) =>
        eb
          .selectFrom("flight_price_history as avgf")
          .select((eb2) => eb2.fn.avg("avgf.price").as("avg_price"))
          .whereRef("avgf.route_hash", "=", "w.route_hash")
          .as("avg_price"),
      "f.currency as latest_currency",
      "f.booking_signal as booking_signal",
      "f.volatility_index as volatility_index",
    ])
    .where("w.user_id", "=", userId)
    .orderBy("w.created_at", "desc")
    .execute()
}