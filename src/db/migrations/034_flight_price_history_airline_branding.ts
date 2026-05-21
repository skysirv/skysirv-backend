import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("flight_price_history")
    .addColumn("airline_name", "text")
    .addColumn("airline_logo_symbol_url", "text")
    .addColumn("airline_logo_lockup_url", "text")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("flight_price_history")
    .dropColumn("airline_logo_lockup_url")
    .dropColumn("airline_logo_symbol_url")
    .dropColumn("airline_name")
    .execute()
}