import type { Kysely } from "kysely"
import type { DB } from "../../db/types.js"

export type CreateAlertInput = {
  route_hash: string
  alert_type: "absolute" | "percentage" | "route_lowest"
  threshold_value?: string | number | null
  direction?: "below" | "above" | null
  watchlist_id?: number | null
}

export async function createAlert(
  db: Kysely<DB>,
  userId: string,
  input: CreateAlertInput
) {
  // Normalize threshold_value to number | null
  const threshold =
    input.threshold_value !== undefined && input.threshold_value !== null
      ? Number(input.threshold_value)
      : null

  const alert = await db
    .insertInto("alerts")
    .values({
      user_id: userId,
      route_hash: input.route_hash,
      alert_type: input.alert_type,
      threshold_value: threshold,
      direction: input.direction ?? null,
      watchlist_id: input.watchlist_id ?? null,
      last_triggered_price: null,
      created_at: new Date()
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return alert
}