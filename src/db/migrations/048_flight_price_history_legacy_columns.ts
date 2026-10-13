import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE flight_price_history
      ADD COLUMN IF NOT EXISTS origin text,
      ADD COLUMN IF NOT EXISTS destination text,
      ADD COLUMN IF NOT EXISTS departure_date timestamp,
      ADD COLUMN IF NOT EXISTS airline text,
      ADD COLUMN IF NOT EXISTS flight_number text
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE flight_price_history
      DROP COLUMN IF EXISTS flight_number,
      DROP COLUMN IF EXISTS airline,
      DROP COLUMN IF EXISTS departure_date,
      DROP COLUMN IF EXISTS destination,
      DROP COLUMN IF EXISTS origin
  `.execute(db)
}