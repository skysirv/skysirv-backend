import { FastifyInstance } from "fastify"
import { addToWatchlist, getUserWatchlist } from "../db/watchlist.js"
import { canCreateWatchlist } from "../services/entitlements.js"

export async function watchlistRoutes(app: FastifyInstance) {

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
        origin,
        destination,
        departureDate
      )

      console.log("WATCHLIST INSERT RESULT:", result)

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