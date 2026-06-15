import { FastifyInstance } from "fastify"
import { getFaaAirportStatuses } from "../services/faaAirportStatus.service.js"
import { getSkysirvLiveWeatherForCoordinates } from "../services/skysirvLiveWeather.service.js"
import { computeSkysirvAirportPressure } from "../services/skysirvLiveAirportPressure.service.js"
import { getAirportFlightPerformanceSignals } from "../services/skysirvLiveFlightPerformance.service.js"
import { getSkysirvLiveAirportCodes } from "../services/skysirvLiveAirportCatalog.service.js"

type SkysirvLivePressureAirport = ReturnType<
  typeof computeSkysirvAirportPressure
>

type SkysirvLivePressureResponse = {
  ok: true
  source: "Skysirv"
  observedAt: string
  cacheTtlSeconds: number
  airports: SkysirvLivePressureAirport[]
}

const SKYSIRV_LIVE_PRESSURE_CACHE_TTL_MS = 60_000

let skysirvLivePressureCache:
  | {
    expiresAt: number
    data: SkysirvLivePressureResponse
  }
  | null = null

export async function skysirvLiveRoutes(app: FastifyInstance) {
  app.get("/skysirv-live/airports/status", async (_request, reply) => {
    try {
      const data = await getFaaAirportStatuses()

      return reply.send({
        ok: true,
        source: data.source,
        observedAt: data.observedAt,
        cacheTtlSeconds: 60,
        airports: data.airports,
      })
    } catch (error) {
      app.log.error({ error }, "Failed to fetch FAA airport statuses")

      return reply.status(502).send({
        ok: false,
        error: "Failed to fetch FAA airport statuses",
        airports: [],
      })
    }
  })

  app.get("/skysirv-live/airports/pressure", async (_request, reply) => {
    const now = Date.now()

    if (skysirvLivePressureCache && skysirvLivePressureCache.expiresAt > now) {
      return reply
        .header("Cache-Control", "no-store")
        .header("X-Skysirv-Live-Cache", "hit")
        .send(skysirvLivePressureCache.data)
    }

    try {
      const faaData = await getFaaAirportStatuses()

      const airportCodes = getSkysirvLiveAirportCodes({
        includeDisabled: true,
        airportClasses: ["major_commercial", "regional_commercial"],
        providers: ["cirium"],
      })

      const flightPerformanceSignals = await getAirportFlightPerformanceSignals(
        airportCodes,
      )

      const faaStatusByAirportCode = new Map(
        faaData.airports.map((airport) => [
          airport.iata.toUpperCase(),
          airport,
        ]),
      )

      const pressureAirportCodes = new Set<string>([
        ...faaStatusByAirportCode.keys(),
        ...flightPerformanceSignals.keys(),
      ])

      const pressureAirports = Array.from(pressureAirportCodes)
        .map((airportCode) => {
          const faaAirport = faaStatusByAirportCode.get(airportCode)
          const flightPerformance = flightPerformanceSignals.get(airportCode)

          return computeSkysirvAirportPressure({
            iata: airportCode,
            faa: faaAirport
              ? {
                severity: faaAirport.severity,
                statusLabel: faaAirport.statusLabel,
                departuresDelay: faaAirport.departuresDelay,
                arrivalsDelay: faaAirport.arrivalsDelay,
                groundStopActive: faaAirport.groundStopActive,
                groundDelayActive: faaAirport.groundDelayActive,
                airportClosureActive: faaAirport.airportClosureActive,
                disruptionReason: faaAirport.disruptionReason,
                eventType: faaAirport.eventType,
              }
              : null,
            flightPerformance,
          })
        })
        .sort(
          (a, b) =>
            b.pressureScore - a.pressureScore || a.iata.localeCompare(b.iata),
        )

      const responseBody: SkysirvLivePressureResponse = {
        ok: true,
        source: "Skysirv",
        observedAt: faaData.observedAt,
        cacheTtlSeconds: 60,
        airports: pressureAirports,
      }

      skysirvLivePressureCache = {
        expiresAt: now + SKYSIRV_LIVE_PRESSURE_CACHE_TTL_MS,
        data: responseBody,
      }

      return reply
        .header("Cache-Control", "no-store")
        .header("X-Skysirv-Live-Cache", "miss")
        .send(responseBody)
    } catch (error) {
      app.log.error({ error }, "Failed to compute Skysirv Live airport pressure")

      if (skysirvLivePressureCache) {
        return reply
          .header("Cache-Control", "no-store")
          .header("X-Skysirv-Live-Cache", "stale")
          .send(skysirvLivePressureCache.data)
      }

      return reply.status(502).send({
        ok: false,
        error: "Failed to compute Skysirv Live airport pressure",
        airports: [],
      })
    }
  })

  app.get("/skysirv-live/weather", async (request, reply) => {
    try {
      const { latitude, longitude } = request.query as {
        latitude?: string
        longitude?: string
      }

      const parsedLatitude = Number(latitude)
      const parsedLongitude = Number(longitude)

      if (
        !Number.isFinite(parsedLatitude) ||
        !Number.isFinite(parsedLongitude)
      ) {
        return reply.status(400).send({
          ok: false,
          error: "Valid latitude and longitude query parameters are required",
        })
      }

      const weather = await getSkysirvLiveWeatherForCoordinates({
        latitude: parsedLatitude,
        longitude: parsedLongitude,
      })

      return reply.send({
        ok: true,
        weather,
      })
    } catch (error) {
      app.log.error({ error }, "Failed to fetch Skysirv Live weather")

      return reply.status(502).send({
        ok: false,
        error: "Failed to fetch Skysirv Live weather",
      })
    }
  })
}