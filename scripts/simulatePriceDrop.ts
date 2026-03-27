import "dotenv/config"
import { db } from "../src/db/kysely.js"
import { getMonitorQueue } from "../src/infra/queues.js"
import { evaluateAlerts } from "../src/monitor/core/evaluateAlerts.js"

async function main() {
  const routeHash =
    "3f4316552d1c52314aa764a20b1dd54ec2309c7e76bb848871da776a7758c056"

  const newPrice = Number(process.argv[2])

  if (Number.isNaN(newPrice)) {
    console.log("Usage: pnpm tsx scripts/simulatePriceDrop.ts <price>")
    process.exit(1)
  }

  const watchlistEntry = await db
    .selectFrom("watchlist")
    .selectAll()
    .where("route_hash", "=", routeHash)
    .limit(1)
    .executeTakeFirst()

  if (!watchlistEntry) {
    console.error("No watchlist entry found for route.")
    process.exit(1)
  }

  await db
    .insertInto("flight_price_history")
    .values({
      route_hash: routeHash,
      origin: watchlistEntry.origin,
      destination: watchlistEntry.destination,
      departure_date: watchlistEntry.departure_date,
      airline: "AA",
      flight_number: "TEST",
      price: newPrice, // ✅ number — no string conversion
      currency: "USD",
    })
    .execute()

  console.log(`📉 Inserted test price: ${newPrice}`)

  const queue = getMonitorQueue()

  await evaluateAlerts(db, queue, routeHash, {
    airline: "AA",
    flightNumber: "TEST",
    price: newPrice,
    currency: "USD",
  })

  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Simulation failed:", err)
  process.exit(1)
})