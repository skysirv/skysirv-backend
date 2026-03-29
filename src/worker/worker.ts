import { Queue, Worker } from "bullmq"
import { QUEUE_NAMES, getEmailQueue } from "../infra/queues.js"
import { db } from "../db/kysely.js"
import { monitorRoute } from "../monitor/monitorRoute.js"
import { DuffelAdapter } from "../providers/duffelAdapter.js"
import { env } from "../config/env.js"
import { sendAlertEmail } from "../services/notificationService.js"
import { AmadeusAdapter } from "../providers/amadeusAdapter.js"

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

export function startWorkers() {
  const providers = [
    new DuffelAdapter(),
    new AmadeusAdapter(),
  ]

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

          const results = providerResults.flatMap((result) => {
            if (result.status === "fulfilled") {
              return result.value
            }

            console.error("Provider search failed:", result.reason)
            return []
          })

          console.log("📦 Prices returned:", results.length)

          return results.map((r) => ({
            airline: r.airline,
            flightNumber: r.flightNumber,
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

        const due = true

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

  const MONITOR_INTERVAL_MS = 6 * 60 * 60 * 1000

  setInterval(() => {
    void enqueueMonitorTick()
  }, MONITOR_INTERVAL_MS)

  void enqueueMonitorTick()

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

  console.log("🚀 Monitor + Notification workers started (Duffel)")
}