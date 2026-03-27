import { db } from "./index.js"
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
      last_checked_at: null
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function getUserWatchlist(userId: string) {
  return db
    .selectFrom("watchlist")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute()
}