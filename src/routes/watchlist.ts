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

      // ✅ TYPES
      type WatchlistLeg = {
        origin: string
        destination: string
        departureDate: string
      }

      type SingleBody = {
        origin: string
        destination: string
        departureDate: string
      }

      type MultiBody = {
        legs: WatchlistLeg[]
      }

      const body = request.body as SingleBody | MultiBody

      // ✅ NORMALIZE INPUT INTO LEGS ARRAY
      let legs: WatchlistLeg[] = []

      if ("legs" in body && Array.isArray(body.legs)) {
        legs = body.legs
      } else {
        const single = body as SingleBody

        legs = [
          {
            origin: single.origin,
            destination: single.destination,
            departureDate: single.departureDate,
          },
        ]
      }

      console.log("BODY:", body)
      console.log("LEGS:", legs)

      // ✅ VALIDATION
      if (!legs.length) {
        return reply.status(400).send({
          error: "Missing required fields",
        })
      }

      for (const leg of legs) {
        if (!leg.origin || !leg.destination || !leg.departureDate) {
          return reply.status(400).send({
            error: "Each leg must include origin, destination, and departureDate",
          })
        }

        const o = leg.origin.trim().toUpperCase()
        const d = leg.destination.trim().toUpperCase()

        if (o === d) {
          return reply.status(400).send({
            error: "Origin and destination cannot be the same airport.",
          })
        }
      }

      const userId = user.id

      console.log("CHECKING ENTITLEMENTS FOR USER:", userId)

      const allowed = await canCreateWatchlist(userId)

      if (!allowed) {
        return reply.status(403).send({
          error: "Watchlist limit reached. Upgrade your plan to add more routes.",
        })
      }

      console.log("ATTEMPTING WATCHLIST INSERT")

      const results: Awaited<ReturnType<typeof addToWatchlist>>[] = []

      for (const leg of legs) {
        const origin = leg.origin.trim().toUpperCase()
        const destination = leg.destination.trim().toUpperCase()

        const result = await addToWatchlist(
          userId,
          origin,
          destination,
          leg.departureDate
        )

        const route = `${origin}-${destination}`

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

        await monitorQueue.add(
          QUEUE_NAMES.monitor,
          {
            routeHash: result.route_hash,
            origin,
            destination,
            departureDate: result.departure_date,
          },
          {
            jobId: result.route_hash,
            removeOnComplete: true,
            removeOnFail: 100,
          }
        )

        results.push(result)
      }

      return reply.send({
        success: true,
        legs: results,
      })
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

  // Delete watchlist route
  app.delete(
    "/watchlist/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      console.log("DELETE WATCHLIST ROUTE HIT")

      const user = request.user as { id: string; email: string }
      const { id } = request.params as { id: string }

      console.log("DELETE REQUEST:", { userId: user.id, watchlistId: id })

      const existing = await db
        .selectFrom("watchlist")
        .selectAll()
        .where("id", "=", id)
        .where("user_id", "=", user.id)
        .executeTakeFirst()

      if (!existing) {
        console.log("WATCHLIST ROW NOT FOUND FOR DELETE")
        return reply.status(404).send({
          error: "Watchlist route not found",
        })
      }

      await db
        .deleteFrom("watchlist")
        .where("id", "=", id)
        .where("user_id", "=", user.id)
        .execute()

      console.log("WATCHLIST ROW DELETED:", {
        id,
        routeHash: existing.route_hash,
      })

      const remaining = await db
        .selectFrom("watchlist")
        .select(({ fn }) => [fn.count("id").as("count")])
        .where("route_hash", "=", existing.route_hash)
        .executeTakeFirst()

      const remainingCount = Number(remaining?.count ?? 0)

      if (remainingCount === 0) {
        await db
          .updateTable("monitored_routes")
          .set({
            is_active: false,
            updated_at: new Date(),
          })
          .where("route_hash", "=", existing.route_hash)
          .execute()

        console.log("MONITORED ROUTE DEACTIVATED:", existing.route_hash)
      } else {
        console.log("MONITORED ROUTE KEPT ACTIVE:", {
          routeHash: existing.route_hash,
          remainingCount,
        })
      }

      return reply.send({
        success: true,
        deletedId: id,
        routeHash: existing.route_hash,
      })
    }
  )
  // Submit user feedback
  app.post(
    "/feedback",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { id: string; email: string }

      const body = request.body as {
        rating?: number
        message?: string
      }

      const rating = Number(body?.rating)
      const message = body?.message?.trim()

      if (!rating || rating < 1 || rating > 5) {
        return reply.status(400).send({
          error: "Rating must be between 1 and 5",
        })
      }

      if (!message) {
        return reply.status(400).send({
          error: "Feedback message is required",
        })
      }

      const feedback = await (app.db as any)
        .insertInto("user_feedback")
        .values({
          user_id: user.id,
          email: user.email,
          rating,
          message,
          status: "new",
          created_at: new Date(),
        })
        .returning([
          "id",
          "user_id",
          "email",
          "rating",
          "message",
          "status",
          "created_at",
        ])
        .executeTakeFirst()

      return reply.send({
        success: true,
        feedback,
      })
    }
  )
}