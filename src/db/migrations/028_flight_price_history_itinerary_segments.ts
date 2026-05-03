import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("flight_price_history")
    .addColumn("itinerary_segments", "jsonb")
    .addColumn("stop_count", "integer")
    .addColumn("itinerary_key", "text")
    .execute()

  await db.schema
    .createIndex("flight_price_history_itinerary_key_idx")
    .on("flight_price_history")
    .column("itinerary_key")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("flight_price_history_itinerary_key_idx").execute()

  await db.schema
    .alterTable("flight_price_history")
    .dropColumn("itinerary_key")
    .dropColumn("stop_count")
    .dropColumn("itinerary_segments")
    .execute()
}