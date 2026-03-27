import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_monitors")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) => col.notNull())
    .addColumn("route_hash", "text", (col) => col.notNull())
    .addColumn("alert_threshold_percent", "integer")
    .addColumn("cooldown_hours", "integer", (col) =>
      col.notNull().defaultTo(12)
    )
    .addColumn("is_active", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  // Index for fast user lookups
  await db.schema
    .createIndex("user_monitors_user_idx")
    .on("user_monitors")
    .column("user_id")
    .execute()

  // Index for fast route alert evaluation
  await db.schema
    .createIndex("user_monitors_route_idx")
    .on("user_monitors")
    .column("route_hash")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_monitors").execute()
}