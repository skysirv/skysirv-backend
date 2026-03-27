// scripts/seedHistory.ts

import "dotenv/config"
import { db } from "../src/db/index.js"
import { sql } from "kysely"

const DAYS_TO_SEED = 180

function applyDailyVolatility(price: number): number {
  const pct = 0.03 + Math.random() * 0.05
  const dir = Math.random() > 0.5 ? 1 : -1
  const next = price + price * pct * dir
  return Math.max(50, next)
}

async function seed() {
  console.log(`🌱 Seeding ${DAYS_TO_SEED} days of history...\n`)

  const watchlist = await db
    .selectFrom("watchlist")
    .selectAll()
    .execute()

  if (!watchlist.length) {
    console.log("❌ No routes in watchlist.")
    process.exit(0)
  }

  for (const route of watchlist) {
    console.log(`📡 Processing ${route.origin}-${route.destination}`)

    const existing = await db
      .selectFrom("flight_price_history")
      .select(sql<number>`COUNT(*)`.as("count"))
      .where("route_hash", "=", route.route_hash)
      .executeTakeFirst()

    if (Number(existing?.count ?? 0) > 0) {
      console.log("⚠️ History already exists. Skipping.")
      continue
    }

    const latest = await db
      .selectFrom("flight_price_history")
      .select(["price"])
      .where("route_hash", "=", route.route_hash)
      .orderBy("captured_at", "desc")
      .limit(1)
      .executeTakeFirst()

    let basePrice = latest?.price ?? 300

    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - DAYS_TO_SEED)

    for (let i = 0; i < DAYS_TO_SEED; i++) {
      const capturedAt = new Date(start)
      capturedAt.setDate(start.getDate() + i)

      basePrice = applyDailyVolatility(basePrice)

      await db
        .insertInto("flight_price_history")
        .values({
          route_hash: route.route_hash,
          price: Math.round(basePrice),
          currency: "USD",
          captured_at: capturedAt,
          origin: route.origin,
          destination: route.destination,
          departure_date: route.departure_date,
          airline: "AA",
          flight_number: "100",
          skyscore: null,
          booking_signal: null,
          volatility_index: null,
        })
        .execute()
    }

    console.log(
      `✅ Seeded ${DAYS_TO_SEED} days for ${route.origin}-${route.destination}`
    )
  }

  console.log("\n🎉 Seeding complete.")
  process.exit(0)
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})