import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("alerts")
    .addColumn("watchlist_id", "integer")
    .execute()

  await db.schema
    .createIndex("alerts_watchlist_id_index")
    .on("alerts")
    .column("watchlist_id")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("alerts")
    .dropColumn("watchlist_id")
    .execute()
}