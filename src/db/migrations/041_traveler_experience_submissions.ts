import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("traveler_experience_submissions")
    .addColumn("id", "uuid", (col) =>
      col
        .primaryKey()
        .notNull()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("destination", "text", (col) => col.notNull())
    .addColumn("feedback", "text", (col) => col.notNull())
    .addColumn("traveler_name", "text", (col) => col.notNull())
    .addColumn("rating", "integer", (col) => col.notNull())
    .addColumn("media_url", "text", (col) => col.notNull())
    .addColumn("media_key", "text", (col) => col.notNull())
    .addColumn("media_type", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("pending_review")
    )
    .addColumn("reviewed_by", "uuid")
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addCheckConstraint(
      "traveler_experience_rating_check",
      sql`rating >= 1 AND rating <= 5`
    )
    .addCheckConstraint(
      "traveler_experience_media_type_check",
      sql`media_type = ANY (ARRAY['image'::text, 'video'::text])`
    )
    .addCheckConstraint(
      "traveler_experience_status_check",
      sql`status = ANY (
        ARRAY[
          'pending_review'::text,
          'approved'::text,
          'rejected'::text
        ]
      )`
    )
    .execute()

  await db.schema
    .createIndex("idx_traveler_experience_submissions_created_at")
    .on("traveler_experience_submissions")
    .column("created_at")
    .execute()

  await db.schema
    .createIndex("idx_traveler_experience_submissions_status")
    .on("traveler_experience_submissions")
    .column("status")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_traveler_experience_submissions_status")
    .execute()

  await db.schema
    .dropIndex("idx_traveler_experience_submissions_created_at")
    .execute()

  await db.schema
    .dropTable("traveler_experience_submissions")
    .execute()
}