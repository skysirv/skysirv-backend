import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable("admin_activity")
        .addColumn("id", "uuid", (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn("message", "text", (col) =>
            col.notNull()
        )
        .addColumn("created_at", "timestamptz", (col) =>
            col.notNull().defaultTo(sql`now()`)
        )
        .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .dropTable("admin_activity")
        .execute()
}