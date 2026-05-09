import { FastifyInstance } from "fastify"
import { z } from "zod"

import { searchBookingOffers } from "../services/booking/bookingSearchService.js"

const MAX_PASSENGERS = 9

const bookingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const bookingLegSchema = z.object({
  origin: z.string().trim().length(3),
  destination: z.string().trim().length(3),
  departureDate: bookingDateSchema,
})

const bookingSearchSchema = z
  .object({
    provider: z.enum(["duffel"]).optional().default("duffel"),
    tripType: z.enum(["one_way", "round_trip", "multi_city"]).default("one_way"),
    origin: z.string().trim().length(3).optional(),
    destination: z.string().trim().length(3).optional(),
    departureDate: bookingDateSchema.optional(),
    returnDate: bookingDateSchema.optional().nullable(),
    legs: z.array(bookingLegSchema).min(2).max(6).optional(),
    adults: z.number().int().min(1).max(MAX_PASSENGERS).default(1),
    children: z.number().int().min(0).max(MAX_PASSENGERS - 1).default(0),
    infants: z.number().int().min(0).max(MAX_PASSENGERS - 1).default(0),
    cabinClass: z
      .enum(["economy", "premium_economy", "business", "first"])
      .default("economy"),
    maxConnections: z.number().int().min(0).max(2).default(1),
  })
  .superRefine((value, context) => {
    const totalPassengers = value.adults + value.children + value.infants

    if (totalPassengers > MAX_PASSENGERS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passengers"],
        message: `Passenger total cannot exceed ${MAX_PASSENGERS}`,
      })
    }

    if (value.infants > value.adults) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["infants"],
        message: "Infants on lap cannot exceed the number of adults",
      })
    }
  })

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function validateLegs(
  legs: { origin: string; destination: string; departureDate: string }[]
) {
  for (const [index, leg] of legs.entries()) {
    const origin = normalizeCode(leg.origin)
    const destination = normalizeCode(leg.destination)

    if (origin === destination) {
      return {
        valid: false,
        error: `Leg ${index + 1} origin and destination must be different`,
      }
    }
  }

  return { valid: true, error: null }
}

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

    if (body.tripType === "multi_city") {
      if (!body.legs || body.legs.length < 2) {
        return reply.status(400).send({
          error: "At least two legs are required for multi-city searches",
        })
      }

      const validation = validateLegs(body.legs)

      if (!validation.valid) {
        return reply.status(400).send({
          error: validation.error,
        })
      }
    } else {
      if (!body.origin || !body.destination || !body.departureDate) {
        return reply.status(400).send({
          error:
            "Origin, destination, and departure date are required for one-way and round-trip searches",
        })
      }

      if (normalizeCode(body.origin) === normalizeCode(body.destination)) {
        return reply.status(400).send({
          error: "Origin and destination must be different",
        })
      }

      if (body.tripType === "round_trip" && !body.returnDate) {
        return reply.status(400).send({
          error: "Return date is required for round-trip searches",
        })
      }
    }

    try {
      const result = await searchBookingOffers({
        provider: body.provider,
        tripType: body.tripType,
        origin: body.origin ? normalizeCode(body.origin) : undefined,
        destination: body.destination
          ? normalizeCode(body.destination)
          : undefined,
        departureDate: body.departureDate,
        returnDate: body.returnDate,
        legs: body.legs?.map((leg) => ({
          origin: normalizeCode(leg.origin),
          destination: normalizeCode(leg.destination),
          departureDate: leg.departureDate,
        })),
        adults: body.adults,
        children: body.children,
        infants: body.infants,
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