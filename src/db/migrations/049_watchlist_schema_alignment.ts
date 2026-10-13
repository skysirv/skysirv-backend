import { Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE watchlist
      ADD COLUMN IF NOT EXISTS route_hash text,
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS last_checked_at timestamptz
  `.execute(db)

  await sql`
    CREATE INDEX IF NOT EXISTS watchlist_route_hash_idx
    ON watchlist (route_hash)
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS watchlist_route_hash_idx
  `.execute(db)

  await sql`
    ALTER TABLE watchlist
      DROP COLUMN IF EXISTS last_checked_at,
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS route_hash
  `.execute(db)
}