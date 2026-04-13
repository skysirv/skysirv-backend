// src/routes/intelligence.ts

import { FastifyInstance } from "fastify"
import { computeSkyscore } from "../intelligence/computeSkyscore.js"
import { computePredict } from "../intelligence/computePredict.js"
import { computeInsights } from "../intelligence/computeInsights.js"

type RangeOption = "30d" | "90d" | "180d"

function parseRange(range?: string): number {
  switch (range) {
    case "30d":
      return 30
    case "90d":
      return 90
    case "180d":
      return 180
    default:
      return 30
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

export async function intelligenceRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/intelligence/wrapped/:year",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { year } = request.params as { year: string }
      const currentUser = request.user as { id: string }

      const numericYear = Number(year)
      const yearStart = new Date(`${numericYear}-01-01T00:00:00.000Z`)
      const yearEnd = new Date(`${numericYear + 1}-01-01T00:00:00.000Z`)

      const wrapped = await (fastify.db as any)
        .selectFrom("user_intelligence_wrapped")
        .selectAll()
        .where("user_id", "=", currentUser.id)
        .where("year", "=", Number(year))
        .executeTakeFirst()

      const completedTripsForYear = await (fastify.db as any)
        .selectFrom("trips")
        .selectAll()
        .where("user_id", "=", currentUser.id)
        .where("status", "=", "completed")
        .where("started_at", ">=", yearStart)
        .where("started_at", "<", yearEnd)
        .orderBy("started_at", "asc")
        .execute()

      const derivedFlights = completedTripsForYear.length

      const derivedRoutesMonitored = new Set(
        completedTripsForYear.map(
          (trip: any) =>
            `${trip.origin_airport_code ?? "—"}-${trip.destination_airport_code ?? "—"}`
        )
      ).size

      if (!wrapped) {
        return reply.send({
          success: false,
          message: `No wrapped data found for year ${year}`,
          year: numericYear,
          wrapped: derivedFlights > 0
            ? {
              flights: derivedFlights,
              routes_monitored: derivedRoutesMonitored,
            }
            : null,
          trips: completedTripsForYear,
          segments: [],
        })
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

      const segmentIds = Array.isArray(parsedPayload?.segmentIds)
        ? parsedPayload.segmentIds
        : []

      const trips = tripIds.length
        ? await (fastify.db as any)
          .selectFrom("trips")
          .selectAll()
          .where("user_id", "=", currentUser.id)
          .where("id", "in", tripIds)
          .orderBy("started_at", "asc")
          .execute()
        : []

      const segments = segmentIds.length
        ? await (fastify.db as any)
          .selectFrom("trip_segments")
          .selectAll()
          .where("user_id", "=", currentUser.id)
          .where("id", "in", segmentIds)
          .orderBy("trip_id", "asc")
          .orderBy("segment_order", "asc")
          .execute()
        : tripIds.length
          ? await (fastify.db as any)
            .selectFrom("trip_segments")
            .selectAll()
            .where("user_id", "=", currentUser.id)
            .where("trip_id", "in", tripIds)
            .orderBy("trip_id", "asc")
            .orderBy("segment_order", "asc")
            .execute()
          : []

      const airportNodes = Array.from(
        new Set(
          segments.flatMap((segment: any) => [
            segment.departure_airport_code,
            segment.arrival_airport_code,
          ]).filter(Boolean)
        )
      ).map((airportCode) => ({
        airportCode,
      }))

      const routeArcs = segments
        .filter(
          (segment: any) =>
            segment.departure_airport_code && segment.arrival_airport_code
        )
        .map((segment: any) => ({
          tripId: segment.trip_id,
          segmentId: segment.id,
          segmentOrder: segment.segment_order,
          origin: segment.departure_airport_code,
          destination: segment.arrival_airport_code,
          airlineCode: segment.airline_code,
          flightNumber: segment.flight_number,
          status: segment.status,
          source: segment.source,
          scheduledDepartureAt: segment.scheduled_departure_at,
          scheduledArrivalAt: segment.scheduled_arrival_at,
        }))

      return reply.send({
        success: true,
        year: numericYear,
        wrapped: {
          ...wrapped,
          flights: derivedFlights > 0 ? derivedFlights : wrapped.flights,
          routes_monitored:
            derivedRoutesMonitored > 0
              ? derivedRoutesMonitored
              : wrapped.routes_monitored,
          wrapped_payload_json: parsedPayload,
        },
        segmentCount: segments.length,
        airportNodes,
        routeArcs,
        trips: trips.length > 0 ? trips : completedTripsForYear,
        segments,
      })
    }
  )

  fastify.get("/intelligence/:routeHash", async (request, reply) => {
    const { routeHash } = request.params as { routeHash: string }
    const { range } = request.query as { range?: RangeOption }

    const db = fastify.db

    const intelligence = await computeSkyscore(db, routeHash)

    if (!intelligence || intelligence.history.length === 0) {
      return reply.send({
        routeHash,
        currentPrice: null,
        currency: null,
        average7d: null,
        average30d: null,
        volatility: null,
        trend: "flat",
        buySignal: false,
        confidence: 0,
        history: [],
        predict: null,
        insights: null,
      })
    }

    const days = parseRange(range)

    const filteredHistory =
      intelligence.history.length <= days
        ? intelligence.history
        : intelligence.history.slice(-days)

    const prices = filteredHistory.map((h) => h.price)

    const currentPrice = prices[prices.length - 1]
    const baselinePrice = median(prices)

    const predict = computePredict({
      prices,
      currentPrice,
      baselinePrice,
    })

    const insights = computeInsights({
      trend: intelligence.trend,
      buySignal: intelligence.buySignal,
      confidence: intelligence.confidence,
      probabilityDrop: predict.probabilityDrop,
      momentumDirection: predict.momentumDirection,
      projectedRangeLow: predict.projectedRangeLow,
      projectedRangeHigh: predict.projectedRangeHigh,
    })

    return reply.send({
      ...intelligence,
      history: filteredHistory,
      range: range ?? "30d",
      predict,
      insights,
    })
  })
}