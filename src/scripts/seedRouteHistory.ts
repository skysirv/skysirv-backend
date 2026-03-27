import "dotenv/config"
import { db } from "../db/index.js"

async function main() {
  const routeHash =
    "3f4316552d1c52314aa764a20b1dd54ec2309c7e76bb848871da776a7758c056"

  const basePrice = 320
  const volatility = 25
  const today = new Date()

  console.log("🌱 Seeding 30-day historical price data...")

  for (let i = 30; i >= 0; i--) {
    const capturedAt = new Date(today)
    capturedAt.setDate(today.getDate() - i)

    // slight downward trend with realistic noise
    const trendAdjustment = -i * 0.8
    const randomNoise = Math.floor((Math.random() - 0.5) * volatility)

    const price = Math.max(
      120,
      Math.round(basePrice + trendAdjustment + randomNoise)
    )

    await db
      .insertInto("flight_price_history")
      .values({
        route_hash: routeHash,
        origin: "MIA",
        destination: "LAX",
        departure_date: new Date("2026-06-01"),
        airline: "AA",
        flight_number: "100",
        price,
        currency: "USD",
        captured_at: capturedAt,
      })
      .execute()
  }

  console.log("✅ Seeded 30-day route history successfully")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Seed failed:", err)
  process.exit(1)
})