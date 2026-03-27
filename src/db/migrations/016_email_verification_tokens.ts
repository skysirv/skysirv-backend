import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {

  await db.schema
    .createTable("email_verification_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("token", "text", (col) =>
      col.notNull().unique()
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

  await db.schema
    .createIndex("email_verification_tokens_token_idx")
    .on("email_verification_tokens")
    .column("token")
    .execute()

}

export async function down(db: Kysely<any>): Promise<void> {

  await db.schema
    .dropTable("email_verification_tokens")
    .execute()

}