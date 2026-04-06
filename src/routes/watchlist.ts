import { FastifyInstance } from "fastify"
import { Queue } from "bullmq"

import { addToWatchlist, getUserWatchlist } from "../db/watchlist.js"
import { canCreateWatchlist } from "../services/entitlements.js"
import { db } from "../db/kysely.js"
import { env } from "../config/env.js"
import { QUEUE_NAMES } from "../infra/queues.js"

export async function watchlistRoutes(app: FastifyInstance) {
  const monitorQueue = new Queue(QUEUE_NAMES.monitor, {
    connection: { url: env.REDIS_URL },
  })

  // Add route to watchlist
  app.post(
    "/watchlist",
    { preHandler: app.authenticate },
    async (request, reply) => {
      console.log("WATCHLIST ROUTE HIT")

      const user = request.user as { id: string; email: string }
      console.log("USER:", user)

      const { origin, destination, departureDate } = request.body as {
        origin: string
        destination: string
        departureDate: string
      }

      console.log("BODY:", { origin, destination, departureDate })

      if (!origin || !destination || !departureDate) {
        console.log("MISSING FIELDS")
        return reply.status(400).send({
          error: "Missing required fields",
        })
      }

      const normalizedOrigin = origin.trim().toUpperCase()
      const normalizedDestination = destination.trim().toUpperCase()

      const userId = user.id

      console.log("CHECKING ENTITLEMENTS FOR USER:", userId)

      const allowed = await canCreateWatchlist(userId)

      console.log("CAN CREATE WATCHLIST:", allowed)

      if (!allowed) {
        console.log("WATCHLIST BLOCKED BY ENTITLEMENTS")
        return reply.status(403).send({
          error: "Watchlist limit reached. Upgrade your plan to add more routes.",
        })
      }

      console.log("ATTEMPTING WATCHLIST INSERT")

      const result = await addToWatchlist(
        userId,
        normalizedOrigin,
        normalizedDestination,
        departureDate
      )

      console.log("WATCHLIST INSERT RESULT:", result)

      const route = `${normalizedOrigin}-${normalizedDestination}`

      await db
        .insertInto("monitored_routes")
        .values({
          route,
          route_hash: result.route_hash,
          frequency_hours: 6,
          is_active: true,
          last_checked_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("route_hash").doUpdateSet({
            route,
            is_active: true,
            updated_at: new Date(),
          })
        )
        .execute()

      console.log("MONITORED ROUTE UPSERTED:", {
        route,
        routeHash: result.route_hash,
      })

      await monitorQueue.add(
        QUEUE_NAMES.monitor,
        {
          routeHash: result.route_hash,
          origin: normalizedOrigin,
          destination: normalizedDestination,
          departureDate: result.departure_date,
        },
        {
          jobId: result.route_hash,
          removeOnComplete: true,
          removeOnFail: 100,
        }
      )

      console.log("IMMEDIATE MONITOR JOB ENQUEUED:", result.route_hash)

      return reply.send(result)
    }
  )

  // Get user's watchlist
  app.get(
    "/watchlist",
    { preHandler: app.authenticate },
    async (request) => {
      console.log("GET WATCHLIST ROUTE HIT")

      const user = request.user as { id: string; email: string }

      console.log("FETCHING WATCHLIST FOR USER:", user.id)

      const watchlist = await getUserWatchlist(user.id)

      console.log("WATCHLIST RESULT:", watchlist)

      return watchlist
    }
  )
}