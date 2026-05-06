import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("airport_indoor_features")
    .addColumn("display_name", "text")
    .addColumn("area_name", "text")
    .addColumn("category", "text")
    .addColumn("search_text", "text")
    .addColumn("aliases", "jsonb")
    .execute()

  await db.schema
    .createIndex("airport_indoor_features_search_text_idx")
    .on("airport_indoor_features")
    .column("search_text")
    .execute()

  await sql`
    UPDATE airport_indoor_features
    SET
      display_name = name,
      category = COALESCE(type, class, 'indoor'),
      search_text = lower(
        concat_ws(
          ' ',
          name,
          normalized_name,
          type,
          class,
          floor_id
        )
      ),
      aliases = '[]'::jsonb
    WHERE search_text IS NULL
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("airport_indoor_features_search_text_idx").execute()

  await db.schema
    .alterTable("airport_indoor_features")
    .dropColumn("aliases")
    .dropColumn("search_text")
    .dropColumn("category")
    .dropColumn("area_name")
    .dropColumn("display_name")
    .execute()
}