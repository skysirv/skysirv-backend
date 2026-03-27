import crypto from "crypto"
import { db } from "../src/db/kysely.js"

const AIRPORTS = [
  "ATL","PEK","LAX","DXB","HND","ORD","LHR","PVG","CDG","DFW",
  "AMS","FRA","IST","CAN","JFK","SIN","DEN","BKK","ICN","MAD",
  "BCN","SFO","SEA","LAS","MIA","PHX","IAH","CLT","MCO","EWR",
  "SYD","MEL","GRU","YYZ","YVR","ZRH","VIE","BRU","DUB","CPH",
  "ARN","OSL","HEL","DOH","AUH","DEL","BOM","KUL","HKG","NRT"
]

function routeHash(origin: string, destination: string) {
  const raw = `${origin}-${destination}`
  return crypto.createHash("sha256").update(raw).digest("hex")
}

async function seedRoutes() {

  const routes = []

  for (const origin of AIRPORTS) {
    for (const destination of AIRPORTS) {

      if (origin === destination) continue

      routes.push({
        origin,
        destination,
        route_hash: routeHash(origin, destination),
        priority: 1,
        is_active: true,
      })
    }
  }

  console.log(`Generated ${routes.length} monitored routes`)

  await db
    .insertInto("monitored_routes")
    .values(routes)
    .onConflict((oc) => oc.column("route_hash").doNothing())
    .execute()

  console.log("✅ Route grid seeded")

  process.exit(0)
}

seedRoutes()