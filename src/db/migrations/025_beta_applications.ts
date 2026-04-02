import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable("beta_applications")
        .addColumn("id", "uuid", (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn("full_name", "text", (col) => col.notNull())
        .addColumn("email", "text", (col) => col.notNull())
        .addColumn("travel_frequency", "text", (col) => col.notNull())
        .addColumn("booking_method", "text", (col) => col.notNull())
        .addColumn("reason", "text", (col) => col.notNull())
        .addColumn("status", "text", (col) =>
            col.notNull().defaultTo("pending")
        )
        .addColumn("created_at", "timestamp", (col) =>
            col.notNull().defaultTo(sql`now()`)
        )
        .execute()

    // Optional index for admin filtering later
    await db.schema
        .createIndex("beta_applications_status_idx")
        .on("beta_applications")
        .column("status")
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable("beta_applications").execute()
}