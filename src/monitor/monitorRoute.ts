import type { Kysely } from "kysely"
import type { Queue } from "bullmq"
import type { Database as DB } from "../db/types.js"

import { evaluateAlerts } from "./core/evaluateAlerts.js"
import { computeIntelligence } from "../intelligence/computeIntelligence.js"
import { computePriceInsight } from "./core/priceIntelligence.js"

export type NormalizedPrice = {
  airline: string
  flightNumber: string
  price: number
  currency: string
}

export type MonitorRouteInput = {
  routeHash: string
  origin: string
  destination: string
  departureDate: string | Date
}

export type PriceProvider = (
  route: MonitorRouteInput
) => Promise<NormalizedPrice[]>

export async function monitorRoute(
  db: Kysely<DB>,
  queue: Queue,
  route: MonitorRouteInput,
  provider: PriceProvider
): Promise<void> {
  console.log("🧠 monitorRoute START", route.routeHash)

  const prices = await provider(route)

  console.log("📦 Prices returned:", prices)

  if (!prices || prices.length === 0) {
    console.log("⚠️ No prices returned from provider")
    return
  }

  /*
  --------------------------------
  STEP 1 — Deduplicate identical fares
  --------------------------------
  */

  const uniqueMap = new Map<string, NormalizedPrice>()

  for (const p of prices) {
    const key = `${p.airline}-${p.flightNumber}-${p.price}`

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p)
    }
  }

  const uniquePrices = Array.from(uniqueMap.values())

  console.log("✂️ Unique fares:", uniquePrices.length)

  /*
  --------------------------------
  STEP 2 — Smart fare filtering
  Remove business / premium fares
  --------------------------------
  */

  const sorted = [...uniquePrices].sort((a, b) => a.price - b.price)

  const cheapest = sorted[0].price
  const maxAllowed = cheapest * 2.2
  const filteredPrices = sorted.filter((p) => p.price <= maxAllowed)

  console.log("🧹 Filtered fares:", filteredPrices.length)

  /*
  --------------------------------
  STEP 3 — Process fares
  --------------------------------
  */

  for (const p of filteredPrices) {
    const capturedAt = new Date()
    const priceInCents = Math.round(p.price * 100)

    console.log("💾 Inserting price history:", {
      priceDollars: p.price,
      priceInCents,
      currency: p.currency,
    })

    await db
      .insertInto("flight_price_history")
      .values({
        route_hash: route.routeHash,
        origin: route.origin,
        destination: route.destination,
        departure_date:
          route.departureDate instanceof Date
            ? route.departureDate
            : new Date(route.departureDate),
        airline: p.airline,
        flight_number: p.flightNumber,
        price: priceInCents,
        currency: p.currency,
        captured_at: capturedAt,
        skyscore: null,
        booking_signal: "WATCH",
        volatility_index: null,
      })
      .execute()

    /*
    --------------------------------
    Load history for intelligence
    --------------------------------
    */

    const history = await db
      .selectFrom("flight_price_history")
      .select(["price", "captured_at"])
      .where("route_hash", "=", route.routeHash)
      .orderBy("captured_at", "asc")
      .execute()

    if (!history || history.length < 2) {
      console.log("⚠️ Not enough history yet — skipping intelligence")
    } else {
      console.log("📊 Computing intelligence")

      const intelligence = computeIntelligence({
        routeHash: route.routeHash,
        history,
      } as any) as any

      await db
        .updateTable("flight_price_history")
        .set({
          skyscore: intelligence?.skyscore ?? null,
          booking_signal: intelligence?.signal ?? "WATCH",
          volatility_index: intelligence?.volatility ?? null,
        })
        .where("route_hash", "=", route.routeHash)
        .where("captured_at", "=", capturedAt)
        .execute()

      /*
      --------------------------------
      Update route intelligence cache
      --------------------------------
      */

      await db
        .insertInto("route_intelligence")
        .values({
          route_hash: route.routeHash,
          median_price: intelligence?.baselinePrice ?? null,
          volatility_index: intelligence?.volatility ?? null,
          trend: intelligence?.predict?.trend ?? null,
          momentum: intelligence?.predict?.momentum ?? null,
          history_depth: intelligence?.historyDepth ?? null,
          last_updated: new Date(),
        })
        .onConflict((oc) =>
          oc.column("route_hash").doUpdateSet({
            median_price: intelligence?.baselinePrice ?? null,
            volatility_index: intelligence?.volatility ?? null,
            trend: intelligence?.predict?.trend ?? null,
            momentum: intelligence?.predict?.momentum ?? null,
            history_depth: intelligence?.historyDepth ?? null,
            last_updated: new Date(),
          })
        )
        .execute()

      /*
      --------------------------------
      Historical deal detection
      --------------------------------
      */

      const insight = await computePriceInsight(
        db,
        route.routeHash,
        priceInCents
      )

      console.log("📈 Price Intelligence", {
        current: priceInCents,
        median: insight.median,
        dealLevel: insight.dealLevel,
      })
    }

    console.log("➡️ Evaluating alerts")

    await evaluateAlerts(db, queue, route.routeHash, {
      ...p,
      price: priceInCents,
    })
  }

  console.log("✅ monitorRoute COMPLETE", route.routeHash)
}