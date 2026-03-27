import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`.execute(db)

  await db.schema
    .createTable('watchlist')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`uuid_generate_v4()`)
    )
    .addColumn('user_id', 'text', (col) => col.notNull())
    .addColumn('origin', 'text', (col) => col.notNull())
    .addColumn('destination', 'text', (col) => col.notNull())
    .addColumn('departure_date', 'date', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('watchlist_user_idx')
    .ifNotExists()
    .on('watchlist')
    .column('user_id')
    .execute()

  await db.schema
    .createTable('price_history')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`uuid_generate_v4()`)
    )
    .addColumn('route_hash', 'text', (col) => col.notNull())
    .addColumn('origin', 'text', (col) => col.notNull())
    .addColumn('destination', 'text', (col) => col.notNull())
    .addColumn('departure_date', 'date', (col) => col.notNull())
    .addColumn('airline', 'text', (col) => col.notNull())
    .addColumn('flight_number', 'text', (col) => col.notNull())
    .addColumn('price', 'numeric', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute()

  await db.schema
    .createIndex('price_route_idx')
    .ifNotExists()
    .on('price_history')
    .columns(['route_hash'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('price_history').ifExists().execute()
  await db.schema.dropTable('watchlist').ifExists().execute()
}