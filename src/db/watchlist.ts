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
  /*
  --------------------------------
  Valid flight history only
  Excludes junk rows from card output
  --------------------------------
  */

  const validFlightHistory = db
    .selectFrom("flight_price_history as fph")
    .selectAll()
    .where("fph.airline", "is not", null)
    .where(sql`trim(fph.airline)`, "!=", "")
    .where(sql`upper(trim(fph.airline))`, "not in", [
      "UNKNOWN",
      "UNKNOWN CARRIER",
      "UNKNOWN AIRLINE",
      "N/A",
      "NA",
      "NULL",
      "UNDEFINED",
      "TBD",
      "XX",
      "YY",
      "--",
      "?",
    ])
    .where("fph.flight_number", "is not", null)
    .where(sql`trim(fph.flight_number)`, "!=", "")
    .where("fph.price", "is not", null)
    .where("fph.price", ">=", 5000)
    .as("valid_flight_history")

  /*
  --------------------------------
  Latest valid capture timestamp per route
  --------------------------------
  */

  const latestPerRoute = db
    .selectFrom(validFlightHistory)
    .select(({ fn, ref }) => [
      ref("route_hash").as("route_hash"),
      fn.max("captured_at").as("latest_captured_at"),
    ])
    .groupBy("route_hash")
    .as("latest_per_route")

  /*
  --------------------------------
  Best latest row per route
  Uses latest valid capture set only,
  then prefers cheapest fare in that set
  --------------------------------
  */

  const latestBestFare = db
    .selectFrom(validFlightHistory)
    .selectAll()
    .distinctOn(["route_hash"])
    .orderBy("route_hash")
    .orderBy("captured_at", "desc")
    .orderBy("price", "asc")
    .as("latest_best_fare")

  return db
    .selectFrom("watchlist as w")
    .leftJoin(latestPerRoute, "latest_per_route.route_hash", "w.route_hash")
    .leftJoin(latestBestFare, "latest_best_fare.route_hash", "w.route_hash")
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

      (eb) => eb("latest_best_fare.price", "/", 100).as("latest_price"),
      "latest_best_fare.airline as latest_airline",
      "latest_best_fare.flight_number as latest_flight_number",
      "latest_best_fare.captured_at as latest_captured_at",
      "latest_best_fare.currency as latest_currency",
      "latest_best_fare.booking_signal as booking_signal",
      "latest_best_fare.volatility_index as volatility_index",

      /*
      --------------------------------
      Recommended flights
      Latest valid capture only
      Sorted by price ascending
      Limited to top 8 so frontend can
      intelligently choose its final 4
      --------------------------------
      */

      (eb) =>
        eb
          .selectFrom(validFlightHistory)
          .select((eb2) =>
            eb2.fn
              .coalesce(
                eb2.fn.jsonAgg(
                  sql`json_build_object(
                    'airline', valid_flight_history.airline,
                    'flightNumber', valid_flight_history.flight_number,
                    'price', valid_flight_history.price / 100.0,
                    'currency', valid_flight_history.currency,
                    'capturedAt', valid_flight_history.captured_at,
                    'bookingSignal', valid_flight_history.booking_signal,
                    'volatilityIndex', valid_flight_history.volatility_index
                  ) ORDER BY valid_flight_history.price ASC`
                ),
                sql`'[]'::json`
              )
              .as("recommended_flights")
          )
          .whereRef("valid_flight_history.route_hash", "=", "w.route_hash")
          .whereRef(
            "valid_flight_history.captured_at",
            "=",
            "latest_per_route.latest_captured_at"
          )
          .limit(8)
          .as("recommended_flights"),

      /*
      --------------------------------
      Average route price
      Based on valid history only
      --------------------------------
      */

      (eb) =>
        eb
          .selectFrom(validFlightHistory)
          .select((eb2) => eb2.fn.avg("valid_flight_history.price").as("avg_price"))
          .whereRef("valid_flight_history.route_hash", "=", "w.route_hash")
          .as("avg_price"),
    ])
    .where("w.user_id", "=", userId)
    .orderBy("w.created_at", "desc")
    .execute()
}