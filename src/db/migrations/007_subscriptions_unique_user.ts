import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("subscriptions_user_unique_idx")
    .on("subscriptions")
    .column("user_id")
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("subscriptions_user_unique_idx")
    .execute();
}