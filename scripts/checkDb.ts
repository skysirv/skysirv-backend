import 'dotenv/config'
import { db } from "../src/db/kysely.js"

async function main() {
  console.log('📦 Database Check')

  const watchlist = await db
    .selectFrom('watchlist')
    .selectAll()
    .execute()

  console.log('\n🗂 Watchlist:')
  console.log(watchlist)

  const history = await db
    .selectFrom('flight_price_history')
    .selectAll()
    .execute()

  console.log('\n📊 Flight Price History:')
  console.log(history)

  const alerts = await db
    .selectFrom('alerts')
    .selectAll()
    .execute()

  console.log('\n🔔 Alerts:')
  console.log(alerts)

  const alertEvents = await db
    .selectFrom('alert_events')
    .selectAll()
    .execute()

  console.log('\n📘 Alert Events:')
  console.log(alertEvents)

  process.exit(0)
}

main().catch(err => {
  console.error('❌ DB Check Failed:', err)
  process.exit(1)
})