import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("flight_price_history")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("route_hash", "varchar(255)", (col) => col.notNull())
    .addColumn("price", "integer", (col) => col.notNull())
    .addColumn("currency", "varchar(10)", (col) => col.notNull())
    .addColumn("captured_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("flight_price_history")
    .ifExists()
    .execute()
}