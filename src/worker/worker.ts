import { Queue, Worker } from "bullmq"
import { QUEUE_NAMES, getEmailQueue } from "../infra/queues.js"
import { db } from "../db/kysely.js"
import { monitorRoute } from "../monitor/monitorRoute.js"
import { DuffelAdapter } from "../providers/duffelAdapter.js"
import { env } from "../config/env.js"
import { sendAlertEmail } from "../services/notificationService.js"
import { AmadeusAdapter } from "../providers/amadeusAdapter.js"
import type { FlightResult } from "../providers/types.js"

function parseBool(v: unknown): boolean {
  if (typeof v !== "string") return false
  return v.toLowerCase() === "true" || v === "1" || v.toLowerCase() === "yes"
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/*
--------------------------------
Dynamic Monitoring Logic
--------------------------------
*/

function computeDynamicIntervalMs(_departureDate: Date): number {
  return 6 * 60 * 60 * 1000
}

/*
--------------------------------
Subscription Governor
--------------------------------
*/

function applySubscriptionGovernor(
  dynamicMs: number,
  planName: string | null
): number {
  if (!planName) return 8 * 60 * 60 * 1000

  const plan = planName.toLowerCase()

  if (plan === "elite") return dynamicMs
  if (plan === "pro") return Math.max(dynamicMs, 2 * 60 * 60 * 1000)

  return Math.max(dynamicMs, 8 * 60 * 60 * 1000)
}

/*
--------------------------------
Itinerary Scoring + Deduping
--------------------------------
*/

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim()
}

function normalizeCarrier(value: string | null | undefined): string {
  return normalizeText(value).toUpperCase()
}

function normalizeFlightNumber(value: string | null | undefined): string {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "")
}

function getMinutesBetween(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null

  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  if (endMs <= startMs) return null

  return Math.round((endMs - startMs) / 60000)
}

function computeDurationMinutes(result: FlightResult): number | null {
  if (
    result.totalDurationMinutes != null &&
    Number.isFinite(result.totalDurationMinutes)
  ) {
    return Number(result.totalDurationMinutes)
  }

  return getMinutesBetween(result.departureTime, result.arrivalTime)
}

function buildSegmentPathKey(result: FlightResult): string {
  const segments = result.segments ?? []

  if (segments.length === 0) {
    return [
      normalizeCarrier(result.operatingCarrier || result.marketingCarrier || result.airline),
      normalizeFlightNumber(result.flightNumber),
      normalizeText(result.departureTime),
      normalizeText(result.arrivalTime),
    ].join("|")
  }

  return segments
    .map((segment) =>
      [
        normalizeText(segment.origin).toUpperCase(),
        normalizeText(segment.destination).toUpperCase(),
        normalizeCarrier(segment.operatingCarrier || segment.marketingCarrier),
        normalizeFlightNumber(
          segment.operatingFlightNumber || segment.marketingFlightNumber
        ),
      ].join(":")
    )
    .join(">")
}

function buildItineraryKey(result: FlightResult): string {
  if (result.itineraryKey && normalizeText(result.itineraryKey)) {
    return normalizeText(result.itineraryKey)
  }

  return buildSegmentPathKey(result)
}

function getStopCount(result: FlightResult): number {
  if (result.stopCount != null && Number.isFinite(result.stopCount)) {
    return Math.max(0, Number(result.stopCount))
  }

  const segments = result.segments ?? []
  if (segments.length > 0) {
    return Math.max(0, segments.length - 1)
  }

  return 0
}

function getPrimaryCarrier(result: FlightResult): string {
  return normalizeCarrier(
    result.operatingCarrier ||
    result.marketingCarrier ||
    result.airline
  )
}

function getDistinctItineraryCarrierCount(result: FlightResult): number {
  const segments = result.segments ?? []

  if (segments.length === 0) {
    return getPrimaryCarrier(result) ? 1 : 0
  }

  const carriers = new Set(
    segments
      .map((segment) =>
        normalizeCarrier(segment.operatingCarrier || segment.marketingCarrier)
      )
      .filter(Boolean)
  )

  return carriers.size || (getPrimaryCarrier(result) ? 1 : 0)
}

function scoreFlight(result: FlightResult): number {
  const price = Number(result.price)
  const stopCount = getStopCount(result)
  const durationMinutes = computeDurationMinutes(result)
  const distinctCarrierCount = getDistinctItineraryCarrierCount(result)

  let score = 0

  if (Number.isFinite(price) && price > 0) {
    score += price
  } else {
    score += 999999
  }

  score += stopCount * 180

  if (distinctCarrierCount > 1) {
    score += (distinctCarrierCount - 1) * 220
  }

  if (durationMinutes != null) {
    score += durationMinutes * 0.35
  } else {
    score += 240
  }

  const carrier = getPrimaryCarrier(result)

  const majorCarriers = [
    "AA", "DL", "UA", "B6", "AS",
    "LH", "AF", "BA", "EK", "QR"
  ]

  if (majorCarriers.includes(carrier)) {
    score -= 50
  }

  return score
}

function collapseDuplicateItineraries(results: FlightResult[]): FlightResult[] {
  const bestByItinerary = new Map<string, FlightResult>()

  for (const result of results) {
    const key = buildItineraryKey(result)
    const existing = bestByItinerary.get(key)

    if (!existing) {
      bestByItinerary.set(key, result)
      continue
    }

    const existingScore = scoreFlight(existing)
    const incomingScore = scoreFlight(result)

    if (incomingScore < existingScore) {
      bestByItinerary.set(key, result)
    }
  }

  return Array.from(bestByItinerary.values())
}

function rankFlights(results: FlightResult[]): FlightResult[] {
  return [...results].sort((a, b) => {
    const scoreDiff = scoreFlight(a) - scoreFlight(b)
    if (scoreDiff !== 0) return scoreDiff

    const priceDiff = Number(a.price) - Number(b.price)
    if (priceDiff !== 0) return priceDiff

    const stopDiff = getStopCount(a) - getStopCount(b)
    if (stopDiff !== 0) return stopDiff

    const durationA = computeDurationMinutes(a) ?? Number.MAX_SAFE_INTEGER
    const durationB = computeDurationMinutes(b) ?? Number.MAX_SAFE_INTEGER

    return durationA - durationB
  })
}

function selectBestFlights(results: FlightResult[], limit = 12): FlightResult[] {
  const collapsed = collapseDuplicateItineraries(results)
  const ranked = rankFlights(collapsed)
  return ranked.slice(0, limit)
}

export function startWorkers() {
  const providers = [new DuffelAdapter(), new AmadeusAdapter()]

  /*
  --------------------------------
  MONITOR WORKER
  --------------------------------
  */

  const monitorWorker = new Worker(
    QUEUE_NAMES.monitor,
    async (job) => {
      const { routeHash, origin, destination, departureDate } = job.data as {
        routeHash: string
        origin: string
        destination: string
        departureDate: string | Date
      }

      console.log("👷 Processing route:", routeHash)

      await monitorRoute(
        db,
        getEmailQueue(),
        {
          routeHash,
          origin,
          destination,
          departureDate,
        },
        async (route) => {
          const departureDateString =
            route.departureDate instanceof Date
              ? route.departureDate.toISOString().split("T")[0]
              : String(route.departureDate)

          const testEnabled = parseBool(process.env.MONITOR_TEST_ENABLED)
          const testRouteHash = String(process.env.MONITOR_TEST_ROUTE_HASH ?? "")
          const testPrice = parseNumber(process.env.MONITOR_TEST_PRICE)

          if (
            testEnabled &&
            testRouteHash &&
            testPrice !== null &&
            route.routeHash === testRouteHash
          ) {
            console.log("🧪 TEST OVERRIDE ACTIVE", {
              routeHash: route.routeHash,
              forcedPrice: testPrice,
            })

            return [
              {
                airline: "AA",
                flightNumber: "100",
                price: testPrice,
                currency: "USD",
              },
            ]
          }

          const providerResults = await Promise.allSettled(
            providers.map((provider) =>
              provider.searchFlights({
                origin: route.origin,
                destination: route.destination,
                departureDate: departureDateString,
              })
            )
          )

          const rawResults = providerResults.flatMap((result) => {
            if (result.status === "fulfilled") {
              return result.value
            }

            console.error("Provider search failed:", result.reason)
            return []
          })

          console.log("📦 Raw provider results:", rawResults.length)

          const selectedResults = selectBestFlights(rawResults, 12)

          console.log("🏆 Selected best flights:", selectedResults.length)

          return selectedResults.map((r) => ({
            airline: getPrimaryCarrier(r) || r.airline,
            flightNumber: normalizeFlightNumber(r.flightNumber) || "0",
            price: r.price,
            currency: r.currency,
          }))
        }
      )

      await new Promise((r) => setTimeout(r, 1200))

      await db
        .updateTable("monitored_routes")
        .set({ last_checked_at: new Date() })
        .where("route_hash", "=", routeHash)
        .execute()

      console.log("✅ Route processed:", routeHash)
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1,
    }
  )

  /*
  --------------------------------
  EMAIL WORKER
  --------------------------------
  */

  const emailWorker = new Worker(
    QUEUE_NAMES.sendEmail,
    async (job) => {
      const { userId, airline, price, currency, routeHash } = job.data as {
        userId: string
        airline: string
        price: number
        currency: string
        routeHash: string
      }

      console.log("📧 Sending alert email to user:", userId)

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", userId)
        .executeTakeFirst()

      if (!user?.email) {
        throw new Error("User email not found")
      }

      await sendAlertEmail({
        userId: user.id,
        to: user.email,
        airline,
        price,
        currency,
        routeHash,
      })

      console.log("📨 Email sent to:", user.email)
    },
    {
      connection: { url: env.REDIS_URL },
    }
  )

  /*
  --------------------------------
  MONITOR SCHEDULER
  --------------------------------
  */

  const monitorQueue = new Queue(QUEUE_NAMES.monitor, {
    connection: { url: env.REDIS_URL },
  })

  const BATCH_SIZE = 200

  async function enqueueMonitorTick() {
    console.log("🕒 Monitor tick: scanning monitored routes...")

    let cursor: string | null = null

    while (true) {
      let query = db
        .selectFrom("monitored_routes as w")
        .select([
          "w.id",
          "w.route",
          "w.route_hash",
          "w.last_checked_at",
          "w.is_active",
        ])
        .where("w.is_active", "=", true)
        .orderBy("w.id")
        .limit(BATCH_SIZE)

      if (cursor) {
        query = query.where("w.id", ">", cursor)
      }

      const routes = await query.execute()

      if (routes.length === 0) break

      for (const r of routes) {
        const routeParts = r.route.split("-")

        if (routeParts.length !== 2) {
          console.warn("⚠️ Invalid route format:", r.route)
          continue
        }

        const [origin, destination] = routeParts

        const watchlistRow = await db
          .selectFrom("watchlist")
          .select(["id", "user_id", "departure_date", "created_at"])
          .where("origin", "=", origin)
          .where("destination", "=", destination)
          .orderBy("created_at", "desc")
          .executeTakeFirst()

        if (!watchlistRow) {
          console.warn("⚠️ No matching watchlist row:", {
            route: r.route,
            routeHash: r.route_hash,
          })
          continue
        }

        const departureDate = new Date(watchlistRow.departure_date)
        const dynamicMs = computeDynamicIntervalMs(departureDate)

        const subscription = await db
          .selectFrom("subscriptions")
          .select(["plan_id", "status"])
          .where("user_id", "=", watchlistRow.user_id)
          .where("status", "=", "active")
          .executeTakeFirst()

        let planName: string | null = null

        if (subscription?.plan_id) {
          const plan = await db
            .selectFrom("plans")
            .select(["name"])
            .where("id", "=", subscription.plan_id)
            .executeTakeFirst()

          planName = plan?.name ?? null
        }

        const finalIntervalMs = applySubscriptionGovernor(dynamicMs, planName)
        const now = Date.now()
        const lastChecked = r.last_checked_at
          ? new Date(r.last_checked_at).getTime()
          : 0

        const due = now - lastChecked >= finalIntervalMs

        if (!due) continue

        await monitorQueue.add(
          QUEUE_NAMES.monitor,
          {
            routeHash: r.route_hash,
            origin,
            destination,
            departureDate: watchlistRow.departure_date,
          },
          {
            jobId: r.route_hash,
            removeOnComplete: true,
            removeOnFail: 100,
            delay: 2000,
          }
        )
      }

      cursor = routes[routes.length - 1].id ?? null
    }

    console.log("✅ Monitored routes scan completed")
  }

  async function runMonitorTick() {
    try {
      await enqueueMonitorTick()
    } catch (error) {
      console.error("🔥 Monitor tick failed:", error)
    }
  }

  const MONITOR_INTERVAL_MS = 6 * 60 * 60 * 1000

  setInterval(() => {
    void runMonitorTick()
  }, MONITOR_INTERVAL_MS)

  void runMonitorTick()

  monitorWorker.on("completed", (job) => {
    console.log(`🎯 Monitor job completed: ${job.name} (${job.id})`)
  })

  monitorWorker.on("failed", (job, err) => {
    console.error(`🔥 Monitor job failed: ${job?.name} (${job?.id})`, err)
  })

  emailWorker.on("completed", (job) => {
    console.log(`📨 Email job completed: ${job.name} (${job.id})`)
  })

  emailWorker.on("failed", (job, err) => {
    console.error(`🔥 Email job failed: ${job?.name} (${job?.id})`, err)
  })

  console.log("🚀 Monitor + Notification workers started")
}