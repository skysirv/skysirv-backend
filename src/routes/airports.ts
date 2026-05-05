import { FastifyInstance } from "fastify"

import { searchAirportIndoorFeatures } from "../services/airportIndoorSearch.js"

export async function airportRoutes(app: FastifyInstance) {
  app.get("/airports/:code/indoor-search", async (request, reply) => {
    const { code } = request.params as { code: string }
    const { q } = request.query as { q?: string }

    const airportCode = code.trim().toUpperCase()
    const query = q?.trim() ?? ""

    if (!query) {
      return []
    }

    try {
      const searchResult = await searchAirportIndoorFeatures({
        airportCode,
        query,
      })

      if (!searchResult.supported) {
        return reply.code(404).send({
          error: "Airport not supported",
          message: `${airportCode} is not configured for indoor airport search yet.`,
        })
      }

      return searchResult.results
    } catch (error) {
      request.log.error(
        {
          error,
          airportCode,
          query,
        },
        "Airport indoor search failed"
      )

      return reply.code(502).send({
        error: "Indoor search unavailable",
        message: "Airport indoor search request failed.",
      })
    }
  })
}