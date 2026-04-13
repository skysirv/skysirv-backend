import { FastifyInstance } from "fastify"
import { z } from "zod"

const createSavedFlightSchema = z.object({
    origin: z.string().min(3).max(8),
    destination: z.string().min(3).max(8),
    departureDate: z.string().optional().nullable(),
    airline: z.string().optional().nullable(),
    flightNumber: z.string().optional().nullable(),
    price: z.number().finite().optional().nullable(),
    currency: z.string().optional().nullable(),
})

export async function savedFlightsRoutes(app: FastifyInstance) {
    app.get(
        "/saved-flights",
        { preHandler: app.authenticate },
        async (request, reply) => {
            const user = request.user as { id: string; email: string }

            const rows = await app.db
                .selectFrom("saved_flights")
                .selectAll()
                .where("user_id", "=", user.id)
                .orderBy("saved_at", "desc")
                .execute()

            return reply.send(rows)
        }
    )

    app.post(
        "/saved-flights",
        { preHandler: app.authenticate },
        async (request, reply) => {
            const user = request.user as { id: string; email: string }

            const parsed = createSavedFlightSchema.safeParse(request.body)

            if (!parsed.success) {
                return reply.status(400).send({
                    error: "Invalid saved flight payload",
                    details: parsed.error.flatten(),
                })
            }

            const payload = parsed.data

            const normalizedOrigin = payload.origin.trim().toUpperCase()
            const normalizedDestination = payload.destination.trim().toUpperCase()
            const parsedDepartureDate = payload.departureDate ? new Date(payload.departureDate) : null

            if (normalizedOrigin === normalizedDestination) {
                return reply.status(400).send({
                    error: "Origin and destination cannot be the same airport.",
                })
            }

            const existing = await app.db
                .selectFrom("saved_flights")
                .select(["id"])
                .where("user_id", "=", user.id)
                .where("origin", "=", normalizedOrigin)
                .where("destination", "=", normalizedDestination)
                .where("departure_date", "=", parsedDepartureDate)
                .where("airline", "=", payload.airline ?? null)
                .where("flight_number", "=", payload.flightNumber ?? null)
                .executeTakeFirst()

            if (existing) {
                return reply.status(409).send({
                    error: "Saved flight already exists",
                })
            }

            const inserted = await app.db
                .insertInto("saved_flights")
                .values({
                    user_id: user.id,
                    origin: normalizedOrigin,
                    destination: normalizedDestination,
                    departure_date: parsedDepartureDate,
                    airline: payload.airline ?? null,
                    flight_number: payload.flightNumber ?? null,
                    price:
                        typeof payload.price === "number" && Number.isFinite(payload.price)
                            ? Math.round(payload.price * 100)
                            : null,
                    currency: payload.currency ?? "USD",
                })
                .returningAll()
                .executeTakeFirstOrThrow()

            return reply.status(201).send(inserted)
        }
    )

    app.patch(
        "/saved-flights/:id/complete",
        { preHandler: app.authenticate },
        async (request, reply) => {
            const user = request.user as { id: string; email: string }
            const { id } = request.params as { id: string }

            const existing = await app.db
                .selectFrom("saved_flights")
                .selectAll()
                .where("id", "=", id)
                .where("user_id", "=", user.id)
                .executeTakeFirst()

            if (!existing) {
                return reply.status(404).send({
                    error: "Saved flight not found",
                })
            }

            if (existing.status === "completed") {
                return reply.status(409).send({
                    error: "Saved flight already completed",
                })
            }

            const completedAt = new Date()

            const updated = await app.db
                .updateTable("saved_flights")
                .set({
                    status: "completed",
                    completed_at: completedAt,
                })
                .where("id", "=", id)
                .where("user_id", "=", user.id)
                .returningAll()
                .executeTakeFirstOrThrow()

            await app.db
                .insertInto("trips")
                .values({
                    user_id: user.id,
                    title: `${existing.origin} → ${existing.destination}`,
                    booking_reference: null,
                    trip_type: "one_way",
                    started_at: existing.departure_date ?? completedAt,
                    ended_at: existing.departure_date ?? completedAt,
                    origin_airport_code: existing.origin,
                    destination_airport_code: existing.destination,
                    status: "completed",
                    created_at: completedAt,
                    updated_at: completedAt,
                })
                .execute()

            return reply.send(updated)
        }
    )
}