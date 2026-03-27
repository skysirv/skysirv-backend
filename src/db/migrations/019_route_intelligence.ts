import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("route_intelligence")
    .addColumn("route_hash", "text", (col) => col.primaryKey())
    .addColumn("median_price", "double precision")
    .addColumn("volatility_index", "double precision")
    .addColumn("trend", "double precision")
    .addColumn("momentum", "double precision")
    .addColumn("history_depth", "integer")
    .addColumn("last_updated", "timestamp")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("route_intelligence")
    .execute()
}