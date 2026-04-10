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

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim()
}

function normalizeAirlineCode(value: string | null | undefined): string {
  return normalizeText(value).toUpperCase()
}

function normalizeFlightNumber(value: string | null | undefined): string {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "")
}

function normalizeCurrency(value: string | null | undefined): string {
  const currency = normalizeText(value).toUpperCase()
  return currency || "USD"
}

function isUnknownAirline(value: string | null | undefined): boolean {
  const airline = normalizeAirlineCode(value)

  if (!airline) return true

  const blocked = new Set([
    "UNKNOWN",
    "UNKNOWN CARRIER",
    "UNKNOWN AIRLINE",
    "N/A",
    "NA",
    "NULL",
    "UNDEFINED",
    "TBD",
    "XX",
    "YY",
    "--",
    "?",
  ])

  return blocked.has(airline)
}

function isValidFlightNumber(value: string | null | undefined): boolean {
  const flightNumber = normalizeFlightNumber(value)

  if (!flightNumber) return false
  if (flightNumber.length < 1) return false

  return /^[A-Z0-9-]{1,10}$/.test(flightNumber)
}

function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 50
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function sanitizePrices(prices: NormalizedPrice[]): NormalizedPrice[] {
  const cleaned: NormalizedPrice[] = []

  for (const raw of prices) {
    const airline = normalizeAirlineCode(raw.airline)
    const flightNumber = normalizeFlightNumber(raw.flightNumber)
    const currency = normalizeCurrency(raw.currency)
    const price = Number(raw.price)

    if (isUnknownAirline(airline)) {
      console.log("🚫 Skipping fare: unknown airline", raw)
      continue
    }

    if (!isValidFlightNumber(flightNumber)) {
      console.log("🚫 Skipping fare: invalid flight number", raw)
      continue
    }

    if (!isValidPrice(price)) {
      console.log("🚫 Skipping fare: invalid or suspiciously low base price", raw)
      continue
    }

    cleaned.push({
      airline,
      flightNumber,
      price: Number(price.toFixed(2)),
      currency,
    })
  }

  return cleaned
}

function dedupePrices(prices: NormalizedPrice[]): NormalizedPrice[] {
  const uniqueMap = new Map<string, NormalizedPrice>()

  for (const p of prices) {
    const key = [
      normalizeAirlineCode(p.airline),
      normalizeFlightNumber(p.flightNumber),
      normalizeCurrency(p.currency),
      Number(p.price.toFixed(2)),
    ].join("|")

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, p)
    }
  }

  return Array.from(uniqueMap.values())
}

function filterOutlierPrices(prices: NormalizedPrice[]): NormalizedPrice[] {
  if (prices.length === 0) return []

  const sorted = [...prices].sort((a, b) => a.price - b.price)
  const priceValues = sorted.map((p) => p.price)
  const median = getMedian(priceValues)
  const cheapest = sorted[0].price

  const maxAllowed = cheapest * 2.2
  const minAllowed = median > 0 ? Math.max(50, median * 0.5) : 50

  const filtered = sorted.filter((p) => {
    if (p.price > maxAllowed) {
      console.log("🚫 Skipping fare: above max allowed", {
        fare: p,
        maxAllowed,
      })
      return false
    }

    if (p.price < minAllowed) {
      console.log("🚫 Skipping fare: below min allowed", {
        fare: p,
        minAllowed,
        median,
      })
      return false
    }

    return true
  })

  if (filtered.length > 0) {
    return filtered
  }

  console.log("⚠️ Outlier filter removed everything — falling back to sanitized list")
  return sorted
}

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
  STEP 1 — Sanitize raw provider data
  Remove junk carriers / invalid fares
  --------------------------------
  */

  const sanitizedPrices = sanitizePrices(prices)

  console.log("🧼 Sanitized fares:", sanitizedPrices.length)

  if (sanitizedPrices.length === 0) {
    console.log("⚠️ No usable fares after sanitizing")
    return
  }

  /*
  --------------------------------
  STEP 2 — Deduplicate identical fares
  --------------------------------
  */

  const uniquePrices = dedupePrices(sanitizedPrices)

  console.log("✂️ Unique fares:", uniquePrices.length)

  if (uniquePrices.length === 0) {
    console.log("⚠️ No usable fares after dedupe")
    return
  }

  /*
  --------------------------------
  STEP 3 — Smart fare filtering
  Remove suspiciously low / overly high fares
  --------------------------------
  */

  const filteredPrices = filterOutlierPrices(uniquePrices)

  console.log("🧹 Filtered fares:", filteredPrices.length)

  if (filteredPrices.length === 0) {
    console.log("⚠️ No usable fares after filtering")
    return
  }

  /*
  --------------------------------
  STEP 4 — Process fares
  --------------------------------
  */

  const capturedAt = new Date()

  for (const p of filteredPrices) {
    const priceInCents = Math.round(p.price * 100)

    console.log("💾 Inserting price history:", {
      airline: p.airline,
      flightNumber: p.flightNumber,
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
          skyscore: null,
          booking_signal: intelligence?.dealLevel ?? "WATCH",
          volatility_index:
            intelligence?.volatility != null
              ? String(intelligence.volatility)
              : null,
        })
        .where("route_hash", "=", route.routeHash)
        .where("captured_at", "=", capturedAt)
        .execute()

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

      const insight = await computePriceInsight(
        db,
        route.routeHash,
        priceInCents
      )

      console.log("📈 Price Intelligence", {
        current: Number((priceInCents / 100).toFixed(2)),
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