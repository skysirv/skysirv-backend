import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("monitored_routes")
    .ifNotExists()
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("origin", "text", (col) =>
      col.notNull()
    )
    .addColumn("destination", "text", (col) =>
      col.notNull()
    )
    .addColumn("route_hash", "text", (col) =>
      col.notNull()
    )
    .addColumn("priority", "integer", (col) =>
      col.defaultTo(1)
    )
    .addColumn("is_active", "boolean", (col) =>
      col.defaultTo(true)
    )
    .addColumn("last_checked_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex("monitored_routes_route_hash_idx")
    .ifNotExists()
    .on("monitored_routes")
    .column("route_hash")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("monitored_routes")
    .ifExists()
    .execute()
}