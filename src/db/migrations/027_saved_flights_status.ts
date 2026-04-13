import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable("saved_flights")
        .addColumn("status", "text", (col) =>
            col.notNull().defaultTo("active")
        )
        .addColumn("completed_at", "timestamp")
        .execute()

    await db.schema
        .createIndex("saved_flights_status_idx")
        .on("saved_flights")
        .column("status")
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex("saved_flights_status_idx").execute()

    await db.schema
        .alterTable("saved_flights")
        .dropColumn("completed_at")
        .dropColumn("status")
        .execute()
}