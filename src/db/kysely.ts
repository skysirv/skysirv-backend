import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { DB } from './types.js'
import { env } from '../config/env.js'


const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
  }),
})

export const db = new Kysely<DB>({
  dialect,
})