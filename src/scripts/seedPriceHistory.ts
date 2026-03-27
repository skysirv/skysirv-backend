import "dotenv/config"
import { db } from "../db/index.js"

async function main() {
  const now = new Date()

  await db
    .insertInto("flight_price_history")
    .values({
      route_hash: "test-seed-hash",
      origin: "MIA",
      destination: "LAX",
      departure_date: new Date("2026-06-01"),
      airline: "AA",
      flight_number: "100",
      price: 199, // ✅ number, not string
      currency: "USD",
      captured_at: now,
    })
    .execute()

  console.log("✅ Seeded flight_price_history")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})