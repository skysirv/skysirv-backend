import { FastifyInstance } from "fastify"
import crypto from "crypto"

export async function monitorRoutes(app: FastifyInstance) {
  app.post(
    "/monitor/start",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const userId = (request.user as any).id
      const { route } = request.body as { route?: string }

      if (!route) {
        return reply.status(400).send({
          error: "Route is required (ex: MIA-JFK)",
        })
      }

      const normalizedRoute = route.trim().toUpperCase()

      const routeHash = crypto
        .createHash("sha256")
        .update(normalizedRoute)
        .digest("hex")

      /**
       * STEP 1
       * Ensure monitored route exists globally
       */

      const monitoredRoute = await app.db
        .selectFrom("monitored_routes")
        .select(["id"])
        .where("route_hash", "=", routeHash)
        .executeTakeFirst()

      if (!monitoredRoute) {
        await app.db
          .insertInto("monitored_routes")
          .values({
            route: normalizedRoute,
            route_hash: routeHash,
            frequency_hours: 6,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .execute()
      }

      /**
       * STEP 2
       * Prevent duplicate monitoring per user
       */

      const existing = await app.db
        .selectFrom("user_monitors")
        .select(["id"])
        .where("user_id", "=", userId)
        .where("route_hash", "=", routeHash)
        .executeTakeFirst()

      if (existing) {
        return {
          message: "Already monitoring this route",
          route: normalizedRoute,
          routeHash,
        }
      }

      /**
       * STEP 3
       * Create user monitor
       */

      await app.db
        .insertInto("user_monitors")
        .values({
          id: crypto.randomUUID(),
          user_id: userId,
          route_hash: routeHash,
          alert_threshold_percent: 10,
          cooldown_hours: 6,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute()

      return {
        success: true,
        route: normalizedRoute,
        routeHash,
        monitoring: "active",
      }
    }
  )
}