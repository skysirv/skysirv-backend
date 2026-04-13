import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable("saved_flights")
        .addColumn("id", "uuid", (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )

        // user relationship
        .addColumn("user_id", "uuid", (col) =>
            col.notNull().references("users.id").onDelete("cascade")
        )

        // route basics
        .addColumn("origin", "text", (col) => col.notNull())
        .addColumn("destination", "text", (col) => col.notNull())
        .addColumn("departure_date", "date")

        // flight info
        .addColumn("airline", "text")
        .addColumn("flight_number", "text")

        // pricing snapshot
        .addColumn("price", "integer") // stored in cents
        .addColumn("currency", "text")

        // metadata
        .addColumn("saved_at", "timestamp", (col) =>
            col.notNull().defaultTo(sql`now()`)
        )

        .execute()

    // useful for fetching user flights fast
    await db.schema
        .createIndex("saved_flights_user_id_idx")
        .on("saved_flights")
        .column("user_id")
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable("saved_flights").execute()
}