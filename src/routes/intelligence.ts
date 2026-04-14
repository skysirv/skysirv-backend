// src/routes/intelligence.ts

import { FastifyInstance } from "fastify"
import { computeSkyscore } from "../intelligence/computeSkyscore.js"
import { computePredict } from "../intelligence/computePredict.js"
import { computeInsights } from "../intelligence/computeInsights.js"
import {
  airportDirectory,
  type AirportDirectoryEntry,
} from "../data/airports.js"

type RangeOption = "30d" | "90d" | "180d"

type RouteArc = {
  tripId: string
  segmentId: string
  segmentOrder: number
  origin: string
  destination: string
  airlineCode: string | null
  flightNumber: string | null
  status: string | null
  source: string | null
  scheduledDepartureAt: string | Date | null
  scheduledArrivalAt: string | Date | null
}

type TripPathSegment = {
  segmentId: string
  segmentOrder: number
  origin: string
  destination: string
  airlineCode: string | null
  flightNumber: string | null
  status: string | null
  source: string | null
  scheduledDepartureAt: string | Date | null
  scheduledArrivalAt: string | Date | null
}

type TripPath = {
  tripId: string
  origin: string
  destination: string
  segmentCount: number
  segments: TripPathSegment[]
}

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

function normalizeAirportCode(code: unknown): string | null {
  if (typeof code !== "string") return null

  const normalized = code.trim().toUpperCase()
  return normalized.length > 0 ? normalized : null
}

function getAirportMeta(code: unknown): AirportDirectoryEntry | null {
  const normalizedCode = normalizeAirportCode(code)

  if (!normalizedCode) return null

  const airportMeta = (airportDirectory as Record<string, AirportDirectoryEntry>)[
    normalizedCode
  ]

  return airportMeta ?? null
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
          wrapped:
            derivedFlights > 0
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

      const airportCodes = Array.from(
        new Set(
          segments
            .flatMap((segment: any) => [
              normalizeAirportCode(segment.departure_airport_code),
              normalizeAirportCode(segment.arrival_airport_code),
            ])
            .filter((code: string | null): code is string => Boolean(code))
        )
      )

      const airportNodes = airportCodes
        .map((airportCode) => {
          const airportMeta = getAirportMeta(airportCode)

          if (!airportMeta) {
            return null
          }

          return {
            airportCode,
            lat: airportMeta.lat,
            lng: airportMeta.lng,
            name: airportMeta.name,
            city: airportMeta.city,
            country: airportMeta.country,
            visits: segments.filter(
              (segment: any) =>
                normalizeAirportCode(segment.departure_airport_code) === airportCode ||
                normalizeAirportCode(segment.arrival_airport_code) === airportCode
            ).length,
            layoverHours: 0,
            loungeHours: 0,
            flights: segments.filter(
              (segment: any) =>
                normalizeAirportCode(segment.departure_airport_code) === airportCode
            ).length,
          }
        })
        .filter((node): node is NonNullable<typeof node> => Boolean(node))

      const routeArcs: RouteArc[] = segments.reduce(
        (acc: RouteArc[], segment: any) => {
          const origin = normalizeAirportCode(segment.departure_airport_code)
          const destination = normalizeAirportCode(segment.arrival_airport_code)

          if (!origin || !destination) {
            return acc
          }

          const originMeta = getAirportMeta(origin)
          const destinationMeta = getAirportMeta(destination)

          if (!originMeta || !destinationMeta) {
            return acc
          }

          acc.push({
            tripId: segment.trip_id,
            segmentId: segment.id,
            segmentOrder: segment.segment_order,
            origin,
            destination,
            airlineCode: segment.airline_code,
            flightNumber: segment.flight_number,
            status: segment.status,
            source: segment.source,
            scheduledDepartureAt: segment.scheduled_departure_at,
            scheduledArrivalAt: segment.scheduled_arrival_at,
          })

          return acc
        },
        []
      )

      const tripPaths: TripPath[] = Array.from(
        routeArcs.reduce((map, arc) => {
          const existing = map.get(arc.tripId)

          const pathSegment: TripPathSegment = {
            segmentId: arc.segmentId,
            segmentOrder: arc.segmentOrder,
            origin: arc.origin,
            destination: arc.destination,
            airlineCode: arc.airlineCode,
            flightNumber: arc.flightNumber,
            status: arc.status,
            source: arc.source,
            scheduledDepartureAt: arc.scheduledDepartureAt,
            scheduledArrivalAt: arc.scheduledArrivalAt,
          }

          if (!existing) {
            map.set(arc.tripId, {
              tripId: arc.tripId,
              origin: arc.origin,
              destination: arc.destination,
              segmentCount: 1,
              segments: [pathSegment],
            })

            return map
          }

          existing.segments.push(pathSegment)
          existing.segmentCount = existing.segments.length

          return map
        }, new Map<string, TripPath>())
          .values()
      )
        .map((tripPath) => {
          const sortedSegments = [...tripPath.segments].sort(
            (a, b) => a.segmentOrder - b.segmentOrder
          )

          return {
            ...tripPath,
            origin: sortedSegments[0]?.origin ?? tripPath.origin,
            destination:
              sortedSegments[sortedSegments.length - 1]?.destination ??
              tripPath.destination,
            segmentCount: sortedSegments.length,
            segments: sortedSegments,
          }
        })
        .sort((a, b) => {
          const aFirstDeparture = a.segments[0]?.scheduledDepartureAt
            ? new Date(a.segments[0].scheduledDepartureAt).getTime()
            : Number.MAX_SAFE_INTEGER

          const bFirstDeparture = b.segments[0]?.scheduledDepartureAt
            ? new Date(b.segments[0].scheduledDepartureAt).getTime()
            : Number.MAX_SAFE_INTEGER

          return aFirstDeparture - bFirstDeparture
        })

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
        tripPaths,
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