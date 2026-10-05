import { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("lucy_conversations")
    .addColumn("planned_trip", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .execute()

  await db.schema
    .createIndex("lucy_conversations_user_planned_trip_idx")
    .on("lucy_conversations")
    .columns(["user_id", "planned_trip"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("lucy_conversations_user_planned_trip_idx")
    .execute()

  await db.schema
    .alterTable("lucy_conversations")
    .dropColumn("planned_trip")
    .execute()
}