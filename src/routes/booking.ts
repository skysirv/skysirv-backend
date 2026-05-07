import { FastifyInstance } from "fastify"
import { z } from "zod"

import { searchBookingOffers } from "../services/booking/bookingSearchService.js"

const bookingSearchSchema = z.object({
  provider: z.enum(["duffel"]).optional().default("duffel"),
  tripType: z.enum(["one_way", "round_trip"]).default("one_way"),
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  adults: z.number().int().min(1).max(9).default(1),
  cabinClass: z
    .enum(["economy", "premium_economy", "business", "first"])
    .default("economy"),
  maxConnections: z.number().int().min(0).max(2).default(1),
})

export async function bookingRoutes(app: FastifyInstance) {
  app.post("/booking/search", async (request, reply) => {
    const parsed = bookingSearchSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid booking search payload",
        details: parsed.error.flatten(),
      })
    }

    const body = parsed.data

    if (body.origin.toUpperCase() === body.destination.toUpperCase()) {
      return reply.status(400).send({
        error: "Origin and destination must be different",
      })
    }

    if (body.tripType === "round_trip" && !body.returnDate) {
      return reply.status(400).send({
        error: "Return date is required for round-trip searches",
      })
    }

    try {
      const result = await searchBookingOffers({
        provider: body.provider,
        tripType: body.tripType,
        origin: body.origin.toUpperCase(),
        destination: body.destination.toUpperCase(),
        departureDate: body.departureDate,
        returnDate: body.returnDate,
        adults: body.adults,
        cabinClass: body.cabinClass,
        maxConnections: body.maxConnections,
      })

      return reply.send({
        status: "success",
        data: result,
      })
    } catch (error) {
      request.log.error({ error }, "Booking search failed")

      return reply.status(502).send({
        error: "Unable to complete flight search right now",
      })
    }
  })
}