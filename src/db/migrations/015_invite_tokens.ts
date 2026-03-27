import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {

  await db.schema
    .createTable("invite_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("email", "text", (col) =>
      col.notNull()
    )
    .addColumn("token", "text", (col) =>
      col.notNull().unique()
    )
    .addColumn("plan", "text", (col) =>
      col.notNull()
    )
    .addColumn("expires_at", "timestamptz", (col) =>
      col.notNull()
    )
    .addColumn("used", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

}

export async function down(db: Kysely<any>): Promise<void> {

  await db.schema
    .dropTable("invite_tokens")
    .execute()

}