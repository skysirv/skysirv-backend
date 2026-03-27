import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("flight_price_history")
    .addColumn("skyscore", "integer")
    .addColumn("booking_signal", "text")
    .addColumn("volatility_index", "text")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("flight_price_history")
    .dropColumn("skyscore")
    .dropColumn("booking_signal")
    .dropColumn("volatility_index")
    .execute()
}