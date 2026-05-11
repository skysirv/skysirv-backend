import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("user_preferred_airports")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("airport_code", "text", (col) => col.notNull())
    .addColumn("airport_name", "text", (col) => col.notNull())
    .addColumn("city", "text", (col) => col.notNull())
    .addColumn("country", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint("user_preferred_airports_user_airport_unique", [
      "user_id",
      "airport_code",
    ])
    .execute()

  await db.schema
    .createIndex("user_preferred_airports_user_id_idx")
    .on("user_preferred_airports")
    .column("user_id")
    .execute()

  await db.schema
    .createTable("user_preferred_routes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("origin", "text", (col) => col.notNull())
    .addColumn("destination", "text", (col) => col.notNull())
    .addColumn("origin_airport_name", "text", (col) => col.notNull())
    .addColumn("destination_airport_name", "text", (col) => col.notNull())
    .addColumn("origin_city", "text", (col) => col.notNull())
    .addColumn("destination_city", "text", (col) => col.notNull())
    .addColumn("origin_country", "text", (col) => col.notNull())
    .addColumn("destination_country", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now"))
    )
    .addUniqueConstraint("user_preferred_routes_user_route_unique", [
      "user_id",
      "origin",
      "destination",
    ])
    .execute()

  await db.schema
    .createIndex("user_preferred_routes_user_id_idx")
    .on("user_preferred_routes")
    .column("user_id")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("user_preferred_routes_user_id_idx").execute()
  await db.schema.dropTable("user_preferred_routes").execute()

  await db.schema.dropIndex("user_preferred_airports_user_id_idx").execute()
  await db.schema.dropTable("user_preferred_airports").execute()
}