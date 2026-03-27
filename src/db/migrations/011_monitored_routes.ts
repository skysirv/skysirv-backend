import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("monitored_routes")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("route", "text", (col) => col.notNull())
    .addColumn("route_hash", "text", (col) => col.notNull().unique())
    .addColumn("frequency_hours", "integer", (col) =>
      col.notNull().defaultTo(6)
    )
    .addColumn("is_active", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("last_checked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex("monitored_routes_hash_idx")
    .on("monitored_routes")
    .column("route_hash")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("monitored_routes").execute()
}