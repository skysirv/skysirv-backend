import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {

  await db.schema
    .createTable("password_reset_tokens")
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
    .createIndex("password_reset_tokens_token_idx")
    .on("password_reset_tokens")
    .column("token")
    .execute()

  await db.schema
    .createIndex("password_reset_tokens_user_id_idx")
    .on("password_reset_tokens")
    .column("user_id")
    .execute()

}

export async function down(db: Kysely<any>): Promise<void> {

  await db.schema
    .dropTable("password_reset_tokens")
    .execute()

}