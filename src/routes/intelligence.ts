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

      const wrapped = await (fastify.db as any)
        .selectFrom("user_intelligence_wrapped")
        .selectAll()
        .where("user_id", "=", currentUser.id)
        .where("year", "=", Number(year))
        .executeTakeFirst()

      if (!wrapped) {
        return reply.send({
          success: false,
          message: `No wrapped data found for year ${year}`,
          year: Number(year),
          wrapped: null,
          trips: [],
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

      const trips = tripIds.length
        ? await (fastify.db as any)
            .selectFrom("trips")
            .selectAll()
            .where("user_id", "=", currentUser.id)
            .where("id", "in", tripIds)
            .orderBy("started_at", "asc")
            .execute()
        : []

      const segments = tripIds.length
        ? await (fastify.db as any)
            .selectFrom("trip_segments")
            .selectAll()
            .where("user_id", "=", currentUser.id)
            .where("trip_id", "in", tripIds)
            .orderBy("trip_id", "asc")
            .orderBy("segment_order", "asc")
            .execute()
        : []

      return reply.send({
        success: true,
        year: Number(year),
        wrapped: {
          ...wrapped,
          wrapped_payload_json: parsedPayload,
        },
        trips,
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