import { FastifyInstance } from "fastify"
import { adminGuard } from "../auth/adminGuard.js"
import crypto from "crypto"
import { sendFeedbackResponseEmail, sendInviteEmail } from "../services/email.js"
import { env } from "../config/env.js"
import { logAdminActivity } from "../services/adminActivity.js"

export async function adminRoutes(app: FastifyInstance) {
  /**
   * Platform status overview
   */
  app.get(
    "/admin/status",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const users = await app.db
        .selectFrom("users")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst()

      const watchlists = await app.db
        .selectFrom("watchlist")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst()

      const activeSubs = await app.db
        .selectFrom("subscriptions")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("status", "=", "active")
        .executeTakeFirst()

      const proUsers = await app.db
        .selectFrom("subscriptions")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("status", "=", "active")
        .where((eb) =>
          eb.or([
            eb("plan_id", "=", "pro"),
            eb("plan_id", "like", "pro_%")
          ])
        )
        .executeTakeFirst()

      const businessUsers = await app.db
        .selectFrom("subscriptions")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("status", "=", "active")
        .where((eb) =>
          eb.or([
            eb("plan_id", "=", "business"),
            eb("plan_id", "like", "business_%")
          ])
        )
        .executeTakeFirst()

      const monitoredRoutes = await app.db
        .selectFrom("monitored_routes")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst()

      const queueJobs = await app.queue.getWaitingCount()

      const totalUsers = Number(users?.count ?? 0)
      const active = Number(activeSubs?.count ?? 0)
      const pro = Number(proUsers?.count ?? 0)
      const business = Number(businessUsers?.count ?? 0)

      return {
        platform: "Skysirv Intelligence Engine",
        users: totalUsers,
        freeUsers: totalUsers - active,
        activeSubscriptions: active,
        proUsers: pro,
        businessUsers: business,
        watchlists: Number(watchlists?.count ?? 0),
        routesMonitored: Number(monitoredRoutes?.count ?? 0),
        queueJobs
      }
    }
  )

  /**
   * System monitoring diagnostics
   */
  app.get(
    "/admin/system",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      return {
        api: "online",
        workers: "active",
        monitorQueue: "running"
      }
    }
  )

  /**
   * Recent admin activity history
   */
  app.get(
    "/admin/activity",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const rows = await app.db
        .selectFrom("admin_activity")
        .select(["id", "message", "created_at"])
        .orderBy("created_at", "desc")
        .limit(50)
        .execute()

      return {
        activity: rows.map((row) => ({
          id: row.id,
          time: new Date(row.created_at).toISOString(),
          message: row.message
        }))
      }
    }
  )

  /**
 * List user feedback
 */
  app.get(
    "/admin/feedback",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const rows = await (app.db as any)
        .selectFrom("user_feedback")
        .select([
          "id",
          "user_id",
          "email",
          "rating",
          "message",
          "status",
          "admin_response",
          "responded_at",
          "used_as_testimonial",
          "testimonial_approved_at",
          "created_at"
        ])
        .orderBy("created_at", "desc")
        .limit(100)
        .execute()

      return {
        feedback: rows.map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          email: row.email,
          rating: row.rating,
          message: row.message,
          status: row.status,
          adminResponse: row.admin_response,
          respondedAt: row.responded_at,
          usedAsTestimonial: row.used_as_testimonial,
          testimonialApprovedAt: row.testimonial_approved_at,
          createdAt: row.created_at
        }))
      }
    }
  )

  /**
 * Respond to user feedback
 */
  app.post(
    "/admin/feedback/:id/respond",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const body = request.body as {
        message?: string
      }

      const responseMessage = body?.message?.trim()

      if (!responseMessage) {
        return reply.status(400).send({
          error: "Response message is required"
        })
      }

      const feedback = await (app.db as any)
        .selectFrom("user_feedback")
        .select(["id", "email", "message"])
        .where("id", "=", id)
        .executeTakeFirst()

      if (!feedback) {
        return reply.status(404).send({
          error: "Feedback not found"
        })
      }

      if (!feedback.email) {
        return reply.status(400).send({
          error: "Feedback does not have an email address"
        })
      }

      await sendFeedbackResponseEmail(feedback.email, responseMessage)

      const updated = await (app.db as any)
        .updateTable("user_feedback")
        .set({
          admin_response: responseMessage,
          responded_at: new Date(),
          status: "responded"
        })
        .where("id", "=", id)
        .returning([
          "id",
          "user_id",
          "email",
          "rating",
          "message",
          "status",
          "admin_response",
          "responded_at",
          "used_as_testimonial",
          "testimonial_approved_at",
          "created_at"
        ])
        .executeTakeFirst()

      await logAdminActivity(app.db, `Feedback response sent: ${feedback.email}`)

      return {
        success: true,
        feedback: updated
      }
    }
  )

  /**
   * Invite beta user
   */
  app.post(
    "/admin/invite-user",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request) => {
      const body = request.body as { email?: string }

      if (!body?.email) {
        throw new Error("Email is required")
      }

      const email = body.email.toLowerCase().trim()

      const token = crypto.randomBytes(16).toString("hex")

      const expires = new Date()
      expires.setHours(expires.getHours() + 48)

      await (app.db as any)
        .insertInto("invite_tokens")
        .values({
          email,
          token,
          plan: "pro_lifetime",
          expires_at: expires,
          used: false
        })
        .execute()

      const inviteLink = `${env.FRONTEND_BASE_URL}/invite/${token}`

      await sendInviteEmail(email, inviteLink)
      await logAdminActivity(app.db, `Lifetime Pro gift sent: ${email}`)

      return {
        success: true,
        inviteLink
      }
    }
  )

  /**
   * Seed sample wrapped + trip history data
   */
  app.post(
    "/admin/seed-wrapped-sample",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request) => {
      const body = request.body as {
        userId?: string
        year?: number
      }

      const currentUser = request.user as { id: string }

      const userId = body?.userId ?? currentUser.id
      const year = body?.year ?? 2026

      const existingWrapped = await (app.db as any)
        .selectFrom("user_intelligence_wrapped")
        .select(["id"])
        .where("user_id", "=", userId)
        .where("year", "=", year)
        .executeTakeFirst()

      if (existingWrapped) {
        throw new Error(`Wrapped data already exists for user ${userId} in ${year}`)
      }

      const tripId = crypto.randomUUID()
      const segmentOneId = crypto.randomUUID()
      const segmentTwoId = crypto.randomUUID()
      const wrappedId = crypto.randomUUID()

      await (app.db as any)
        .insertInto("trips")
        .values({
          id: tripId,
          user_id: userId,
          title: "London Spring Trip",
          booking_reference: "SKY26LHR01",
          trip_type: "round_trip",
          started_at: new Date("2026-04-12T09:00:00Z"),
          ended_at: new Date("2026-04-20T18:30:00Z"),
          origin_airport_code: "BOS",
          destination_airport_code: "LHR",
          status: "completed",
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute()

      await (app.db as any)
        .insertInto("trip_segments")
        .values([
          {
            id: segmentOneId,
            trip_id: tripId,
            user_id: userId,
            segment_order: 1,
            airline_code: "BA",
            flight_number: "BA214",
            departure_airport_code: "BOS",
            departure_terminal: "E",
            departure_gate: "E7",
            scheduled_departure_at: new Date("2026-04-12T09:00:00Z"),
            actual_departure_at: new Date("2026-04-12T09:18:00Z"),
            arrival_airport_code: "LHR",
            arrival_terminal: "5",
            arrival_gate: "C52",
            scheduled_arrival_at: new Date("2026-04-12T18:55:00Z"),
            actual_arrival_at: new Date("2026-04-12T18:49:00Z"),
            cabin_class: "business",
            fare_class: "J",
            aircraft_type: "A350-1000",
            distance_km: 5260,
            status: "flown",
            source: "seed",
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            id: segmentTwoId,
            trip_id: tripId,
            user_id: userId,
            segment_order: 2,
            airline_code: "BA",
            flight_number: "BA213",
            departure_airport_code: "LHR",
            departure_terminal: "5",
            departure_gate: "A10",
            scheduled_departure_at: new Date("2026-04-20T14:10:00Z"),
            actual_departure_at: new Date("2026-04-20T14:03:00Z"),
            arrival_airport_code: "BOS",
            arrival_terminal: "E",
            arrival_gate: "E5",
            scheduled_arrival_at: new Date("2026-04-20T18:30:00Z"),
            actual_arrival_at: new Date("2026-04-20T18:24:00Z"),
            cabin_class: "business",
            fare_class: "J",
            aircraft_type: "A350-1000",
            distance_km: 5260,
            status: "flown",
            source: "seed",
            created_at: new Date(),
            updated_at: new Date()
          }
        ])
        .execute()

      await (app.db as any)
        .insertInto("user_intelligence_wrapped")
        .values({
          id: wrappedId,
          user_id: userId,
          year,
          status: "draft",
          flights: 18,
          countries: 7,
          distance_km: 142000,
          skyscore_avg: 87,
          savings_total: 2340,
          avg_savings: 130,
          beat_market_pct: 71,
          routes_monitored: 12,
          alerts_triggered: 46,
          alerts_won: 9,
          traveler_identity: "Precision Booker",
          wrapped_payload_json: JSON.stringify({
            bestRoute: {
              route: "BOS-LHR",
              saved: 312,
              beforeSpike: "19%",
              timingGrade: "A+"
            },
            travelFootprint: {
              airports: ["BOS", "LHR"],
              highlightedYear: year
            },
            tripIds: [tripId],
            segmentIds: [segmentOneId, segmentTwoId]
          }),
          generated_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute()

      return {
        success: true,
        userId,
        year,
        wrappedId,
        tripId,
        segmentIds: [segmentOneId, segmentTwoId]
      }
    }
  )

  /**
   * Read wrapped sample + trips + trip segments
   */
  app.get(
    "/admin/wrapped-sample/:year",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request) => {
      const { year } = request.params as { year: string }
      const currentUser = request.user as { id: string }

      const wrapped = await (app.db as any)
        .selectFrom("user_intelligence_wrapped")
        .selectAll()
        .where("user_id", "=", currentUser.id)
        .where("year", "=", Number(year))
        .executeTakeFirst()

      if (!wrapped) {
        return {
          success: false,
          message: `No wrapped data found for year ${year}`,
          year: Number(year),
          wrapped: null,
          trips: [],
          segments: []
        }
      }

      let parsedPayload: any = wrapped.wrapped_payload_json

      if (typeof parsedPayload === "string") {
        try {
          parsedPayload = JSON.parse(parsedPayload)
        } catch {
          parsedPayload = wrapped.wrapped_payload_json
        }
      }

      const tripIds = Array.isArray(parsedPayload?.tripIds)
        ? parsedPayload.tripIds
        : []

      const trips = tripIds.length
        ? await (app.db as any)
          .selectFrom("trips")
          .selectAll()
          .where("user_id", "=", currentUser.id)
          .where("id", "in", tripIds)
          .orderBy("started_at", "asc")
          .execute()
        : []

      const segments = tripIds.length
        ? await (app.db as any)
          .selectFrom("trip_segments")
          .selectAll()
          .where("user_id", "=", currentUser.id)
          .where("trip_id", "in", tripIds)
          .orderBy("trip_id", "asc")
          .orderBy("segment_order", "asc")
          .execute()
        : []

      return {
        success: true,
        year: Number(year),
        wrapped: {
          ...wrapped,
          wrapped_payload_json: parsedPayload
        },
        trips,
        segments
      }
    }
  )

  /**
   * List users with subscription info
   */
  app.get(
    "/admin/users",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const rows = await app.db
        .selectFrom("users")
        .leftJoin("subscriptions", "subscriptions.user_id", "users.id")
        .select([
          "users.id",
          "users.email",
          "users.is_admin",
          "users.created_at",
          "subscriptions.plan_id",
          "subscriptions.status",
          "subscriptions.billing_interval"
        ])
        .execute()

      const users = rows.map((row: any) => {
        let plan = "free"
        let status = "active"
        let billingInterval: string | null = null

        if (row.is_admin) {
          plan = "admin"
          status = "active"
          billingInterval = null
        } else if (row.plan_id) {
          plan = row.plan_id
          status = row.status || "active"
          billingInterval = row.billing_interval ?? null
        }

        return {
          id: row.id,
          email: row.email,
          plan,
          billing_interval: billingInterval,
          status,
          createdAt: row.created_at ?? null
        }
      })

      return { users }
    }
  )

  /**
   * DELETE USER
   */
  app.delete(
    "/admin/users/:id",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async (request) => {
      const { id } = request.params as { id: string }

      const currentUser = request.user as { id: string }

      if (currentUser.id === id) {
        throw new Error("You cannot delete your own admin account")
      }

      const user = await app.db
        .selectFrom("users")
        .select(["id", "email", "is_admin"])
        .where("id", "=", id)
        .executeTakeFirst()

      if (!user) {
        throw new Error("User not found")
      }

      if (user.is_admin) {
        throw new Error("Admin account cannot be deleted")
      }

      await app.db
        .deleteFrom("users")
        .where("id", "=", id)
        .execute()

      await logAdminActivity(app.db, `User removed: ${user.email}`)

      return {
        success: true
      }
    }
  )

  /**
   * List subscriptions
   */
  app.get(
    "/admin/subscriptions",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const subscriptions = await app.db
        .selectFrom("subscriptions")
        .selectAll()
        .execute()

      return { subscriptions }
    }
  )

  /**
   * List watchlists
   */
  app.get(
    "/admin/watchlists",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const watchlists = await app.db
        .selectFrom("watchlist")
        .selectAll()
        .execute()

      return { watchlists }
    }
  )

  /**
   * Trigger monitor engine manually
   */
  app.post(
    "/admin/run-monitor",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      await app.queue.add("monitor-routes", {})

      return {
        status: "monitor triggered"
      }
    }
  )

  /**
   * Simulate alert event
   */
  app.post(
    "/admin/simulate-alert",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      await app.queue.add("simulate-alert", {
        message: "Simulated price drop alert"
      })

      return {
        status: "alert simulation queued"
      }
    }
  )

  /**
   * Platform telemetry
   */
  app.get(
    "/admin/telemetry",
    {
      preHandler: [app.authenticate, adminGuard]
    },
    async () => {
      const routes = await app.db
        .selectFrom("monitored_routes")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst()

      const alerts = await app.db
        .selectFrom("alert_events")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst()

      const queueJobs = await app.queue.getWaitingCount()

      return {
        routesMonitored: Number(routes?.count ?? 0),
        alertsSent: Number(alerts?.count ?? 0),
        queueJobs
      }
    }
  )

  /**
   * Live activity stream (SSE)
   */
  app.get(
    "/admin/activity-stream",
    async (request, reply) => {
      const { token } = request.query as { token?: string }

      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" })
      }

      try {
        const decoded = app.jwt.verify(token) as { id: string }

        const user = await app.db
          .selectFrom("users")
          .selectAll()
          .where("id", "=", decoded.id)
          .executeTakeFirst()

        if (!user || !user.is_admin) {
          return reply.status(403).send({ error: "Admin required" })
        }
      } catch {
        return reply.status(401).send({ error: "Invalid token" })
      }

      reply.raw.setHeader("Access-Control-Allow-Origin", env.FRONTEND_BASE_URL)
      reply.raw.setHeader("Content-Type", "text/event-stream")
      reply.raw.setHeader("Cache-Control", "no-cache")
      reply.raw.setHeader("Connection", "keep-alive")

      reply.raw.flushHeaders()

      let lastSeenCreatedAt = new Date().toISOString()
      const sentIds = new Set<string>()

      const sendEvent = (payload: { time: string; message: string }) => {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      const poll = setInterval(async () => {
        try {
          const rows = await app.db
            .selectFrom("admin_activity")
            .select(["id", "message", "created_at"])
            .where("created_at", ">=", new Date(lastSeenCreatedAt))
            .orderBy("created_at", "asc")
            .execute()

          for (const row of rows) {
            if (sentIds.has(row.id)) {
              continue
            }

            sentIds.add(row.id)

            if (sentIds.size > 500) {
              const ids = Array.from(sentIds)
              sentIds.clear()
              for (const id of ids.slice(-200)) {
                sentIds.add(id)
              }
            }

            lastSeenCreatedAt = new Date(row.created_at).toISOString()

            sendEvent({
              time: new Date(row.created_at).toISOString(),
              message: row.message
            })
          }
        } catch (error) {
          request.log.error(error)
        }
      }, 3000)

      const keepAlive = setInterval(() => {
        reply.raw.write(`: keepalive\n\n`)
      }, 30000)

      request.raw.on("close", () => {
        clearInterval(poll)
        clearInterval(keepAlive)
      })
    }
  )
}