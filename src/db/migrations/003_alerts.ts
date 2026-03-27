import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("alerts")
    .addColumn("id", "serial", col => col.primaryKey())
    .addColumn("user_id", "uuid", col => col.notNull())
    .addColumn("route_hash", "text", col => col.notNull())

    // Alert configuration
    .addColumn("alert_type", "text", col => col.notNull())
    // types:
    // "absolute"
    // "percentage"
    // "route_lowest"

    .addColumn("threshold_value", "numeric")
    // absolute: price
    // percentage: percent drop
    // route_lowest: can be null

    .addColumn("direction", "text")
    // "below" | "above" | null (for route_lowest)

    // state tracking
    .addColumn("last_triggered_price", "numeric")
    .addColumn("created_at", "timestamptz", col =>
      col.defaultTo(sql`now()`).notNull()
    )

    .execute()

  await db.schema
    .createIndex("alerts_route_hash_index")
    .on("alerts")
    .column("route_hash")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("alerts").execute()
}