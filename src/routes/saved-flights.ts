import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"

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
            const tripId = crypto.randomUUID()

            const subscription = await app.db
                .selectFrom("subscriptions")
                .select(["plan_id", "status"])
                .where("user_id", "=", user.id)
                .where("status", "=", "active")
                .executeTakeFirst()

            const planId = subscription?.plan_id ?? "free"

            const isProOrEnterprise =
                planId === "pro" ||
                planId.startsWith("pro_") ||
                planId === "enterprise" ||
                planId.startsWith("enterprise_")

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
                    id: tripId,
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

            if (isProOrEnterprise) {
                const wrappedYear =
                    existing.departure_date != null
                        ? new Date(existing.departure_date).getFullYear()
                        : completedAt.getFullYear()

                const existingWrapped = await app.db
                    .selectFrom("user_intelligence_wrapped")
                    .selectAll()
                    .where("user_id", "=", user.id)
                    .where("year", "=", wrappedYear)
                    .executeTakeFirst()

                if (!existingWrapped) {
                    await app.db
                        .insertInto("user_intelligence_wrapped")
                        .values({
                            id: crypto.randomUUID(),
                            user_id: user.id,
                            year: wrappedYear,
                            status: "draft",
                            flights: 1,
                            countries: 0,
                            distance_km: 0,
                            skyscore_avg: 0,
                            savings_total: 0,
                            avg_savings: 0,
                            beat_market_pct: 0,
                            routes_monitored: 1,
                            alerts_triggered: 0,
                            alerts_won: 0,
                            traveler_identity: "Smart Traveler",
                            wrapped_payload_json: JSON.stringify({
                                bestRoute: {
                                    route: `${existing.origin}-${existing.destination}`,
                                    saved: 0,
                                    beforeSpike: "—",
                                    timingGrade: "—",
                                },
                                tripIds: [tripId],
                            }),
                            generated_at: completedAt,
                            created_at: completedAt,
                            updated_at: completedAt,
                        })
                        .execute()
                } else {
                    let parsedPayload: any = existingWrapped.wrapped_payload_json

                    if (typeof parsedPayload === "string") {
                        try {
                            parsedPayload = JSON.parse(parsedPayload)
                        } catch {
                            parsedPayload = existingWrapped.wrapped_payload_json
                        }
                    }

                    const currentTripIds = Array.isArray(parsedPayload?.tripIds)
                        ? parsedPayload.tripIds
                        : []

                    const nextTripIds = currentTripIds.includes(tripId)
                        ? currentTripIds
                        : [...currentTripIds, tripId]

                    await app.db
                        .updateTable("user_intelligence_wrapped")
                        .set({
                            flights: Number(existingWrapped.flights ?? 0) + 1,
                            routes_monitored: Number(existingWrapped.routes_monitored ?? 0) + 1,
                            wrapped_payload_json: JSON.stringify({
                                ...(parsedPayload ?? {}),
                                bestRoute:
                                    parsedPayload?.bestRoute ?? {
                                        route: `${existing.origin}-${existing.destination}`,
                                        saved: 0,
                                        beforeSpike: "—",
                                        timingGrade: "—",
                                    },
                                tripIds: nextTripIds,
                            }),
                            updated_at: completedAt,
                        })
                        .where("id", "=", existingWrapped.id)
                        .execute()
                }

                request.log.info(
                    { userId: user.id, planId, savedFlightId: id, tripId, wrappedYear },
                    "Completed saved flight updated wrapped draft"
                )
            }

            return reply.send(updated)
        }
    )

    app.delete(
        "/saved-flights/:id",
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

            await app.db
                .deleteFrom("saved_flights")
                .where("id", "=", id)
                .where("user_id", "=", user.id)
                .execute()

            return reply.send({
                success: true,
                deletedId: id,
            })
        }
    )
}