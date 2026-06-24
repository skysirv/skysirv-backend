import { FastifyInstance } from "fastify"
import { getFaaAirportStatuses } from "../services/faaAirportStatus.service.js"
import { getSkysirvLiveWeatherForCoordinates } from "../services/skysirvLiveWeather.service.js"
import { computeSkysirvAirportPressure } from "../services/skysirvLiveAirportPressure.service.js"
import { getAirportFlightPerformanceSignals } from "../services/skysirvLiveFlightPerformance.service.js"
import { getSkysirvLiveAirportCodes } from "../services/skysirvLiveAirportCatalog.service.js"
import {
  CiriumLiveAircraftApiError,
  canUseCiriumLiveAircraft,
  getCiriumLiveAircraftBoundingBoxPositionsWithTrackDetails,
  getCiriumLiveAircraftRegionPositions,
  getCiriumLiveAircraftRegionPositionsWithTrackDetails,
  getCiriumLiveAircraftTrackDetails,
  type SkysirvLiveAircraft,
  type SkysirvLiveAircraftTrackDetails,
  type SkysirvLiveAircraftWithTrackDetails,
} from "../services/ciriumLiveAircraft.service.js"

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

const SKYSIRV_LIVE_AIRCRAFT_POSITIONS_CACHE_TTL_MS = 30_000
const SKYSIRV_LIVE_AIRCRAFT_ENRICHED_CACHE_TTL_MS = 90_000
const SKYSIRV_LIVE_AIRCRAFT_STALE_TTL_MS = 5 * 60_000

type LiveAircraftCacheEntry<T> = {
  expiresAt: number
  staleUntil: number
  data: T
}

type SkysirvLiveAircraftRegionPositionsResponse = {
  ok: true
  source: "Cirium"
  mode: "positions"
  observedAt: string
  regionKey: string
  cacheTtlSeconds: number
  aircraft: SkysirvLiveAircraft[]
}

type SkysirvLiveAircraftRegionEnrichedResponse = {
  ok: true
  source: "Cirium"
  mode: "enriched"
  observedAt: string
  regionKey: string
  cacheTtlSeconds: number
  aircraft: SkysirvLiveAircraftWithTrackDetails[]
}

type SkysirvLiveAircraftTrackResponse = {
  ok: true
  source: "Cirium"
  observedAt: string
  aircraft: SkysirvLiveAircraftTrackDetails
}

const liveAircraftRegionPositionsCache = new Map<
  string,
  LiveAircraftCacheEntry<SkysirvLiveAircraftRegionPositionsResponse>
>()

const liveAircraftRegionEnrichedCache = new Map<
  string,
  LiveAircraftCacheEntry<SkysirvLiveAircraftRegionEnrichedResponse>
>()

function getLiveAircraftRegionCacheKey(params: {
  regionKey: string
  maxAircraft?: number
}) {
  return `${params.regionKey.trim().toLowerCase()}:maxAircraft=${params.maxAircraft ?? "default"
    }`
}

const CIRIUM_LIVE_AIRCRAFT_QUOTA_ERROR = "quota_exceeded"

function getCiriumLiveAircraftDisabledBody(emptyAircraftValue: [] | null) {
  return {
    ok: false,
    error: "Live aircraft is temporarily unavailable.",
    providerCode: "live_aircraft_disabled",
    providerMessage:
      "Cirium Live Aircraft is currently disabled to protect API quota.",
    aircraft: emptyAircraftValue,
  }
}

function getCiriumLiveAircraftErrorStatus(error: unknown) {
  if (!(error instanceof CiriumLiveAircraftApiError)) return 502

  if (error.code === CIRIUM_LIVE_AIRCRAFT_QUOTA_ERROR) {
    return 429
  }

  if (error.statusCode >= 400 && error.statusCode < 600) {
    return error.statusCode
  }

  return 502
}

function getCiriumLiveAircraftErrorLogContext(error: unknown) {
  if (!(error instanceof CiriumLiveAircraftApiError)) {
    return {}
  }

  return {
    providerStatusCode: error.statusCode,
    providerCode: error.code,
    providerMessage: error.providerMessage,
    providerRequestUrl: error.requestUrl,
  }
}

function getCiriumLiveAircraftErrorBody(params: {
  error: unknown
  fallbackMessage: string
  emptyAircraftValue: [] | null
}) {
  if (params.error instanceof CiriumLiveAircraftApiError) {
    const isQuotaExceeded =
      params.error.code === CIRIUM_LIVE_AIRCRAFT_QUOTA_ERROR

    return {
      ok: false,
      error: isQuotaExceeded
        ? "Cirium live aircraft quota has been reached"
        : params.fallbackMessage,
      providerCode: params.error.code,
      providerMessage: params.error.providerMessage,
      providerRequestUrl: params.error.requestUrl,
      aircraft: params.emptyAircraftValue,
    }
  }

  return {
    ok: false,
    error: params.fallbackMessage,
    aircraft: params.emptyAircraftValue,
  }
}

let skysirvLivePressureCache:
  | {
    expiresAt: number
    data: SkysirvLivePressureResponse
  }
  | null = null

function parseOptionalNumber(value: string | undefined) {
  if (value === undefined) return undefined

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : null
}

function parseRequiredNumber(value: string | undefined) {
  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : null
}

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

  app.get(
    "/skysirv-live/aircraft/positions/bounds",
    async (request, reply) => {
      try {
        if (!canUseCiriumLiveAircraft()) {
          return reply
            .status(503)
            .send(getCiriumLiveAircraftDisabledBody([]))
        }
        const {
          topLatitude,
          leftLongitude,
          bottomLatitude,
          rightLongitude,
          maxAircraft,
          maxTiles,
          maxFlightsPerTile,
        } = request.query as {
          topLatitude?: string
          leftLongitude?: string
          bottomLatitude?: string
          rightLongitude?: string
          maxAircraft?: string
          maxTiles?: string
          maxFlightsPerTile?: string
        }

        const parsedTopLatitude = parseRequiredNumber(topLatitude)
        const parsedLeftLongitude = parseRequiredNumber(leftLongitude)
        const parsedBottomLatitude = parseRequiredNumber(bottomLatitude)
        const parsedRightLongitude = parseRequiredNumber(rightLongitude)
        const parsedMaxAircraft = parseOptionalNumber(maxAircraft)
        const parsedMaxTiles = parseOptionalNumber(maxTiles)
        const parsedMaxFlightsPerTile = parseOptionalNumber(maxFlightsPerTile)

        if (
          parsedTopLatitude === null ||
          parsedLeftLongitude === null ||
          parsedBottomLatitude === null ||
          parsedRightLongitude === null
        ) {
          return reply.status(400).send({
            ok: false,
            error:
              "Valid topLatitude, leftLongitude, bottomLatitude, and rightLongitude query parameters are required",
            aircraft: [],
          })
        }

        if (parsedMaxAircraft === null) {
          return reply.status(400).send({
            ok: false,
            error: "maxAircraft must be a valid number",
            aircraft: [],
          })
        }

        if (parsedMaxTiles === null) {
          return reply.status(400).send({
            ok: false,
            error: "maxTiles must be a valid number",
            aircraft: [],
          })
        }

        if (parsedMaxFlightsPerTile === null) {
          return reply.status(400).send({
            ok: false,
            error: "maxFlightsPerTile must be a valid number",
            aircraft: [],
          })
        }

        const aircraft =
          await getCiriumLiveAircraftBoundingBoxPositionsWithTrackDetails({
            topLatitude: parsedTopLatitude,
            leftLongitude: parsedLeftLongitude,
            bottomLatitude: parsedBottomLatitude,
            rightLongitude: parsedRightLongitude,
            maxAircraft: parsedMaxAircraft,
            maxTiles: parsedMaxTiles,
            maxFlightsPerTile: parsedMaxFlightsPerTile,
          })

        return reply.header("Cache-Control", "no-store").send({
          ok: true,
          source: "Cirium",
          observedAt: new Date().toISOString(),
          bounds: {
            topLatitude: parsedTopLatitude,
            leftLongitude: parsedLeftLongitude,
            bottomLatitude: parsedBottomLatitude,
            rightLongitude: parsedRightLongitude,
          },
          aircraft,
        })
      } catch (error) {
        app.log.error(
          { error, ...getCiriumLiveAircraftErrorLogContext(error) },
          "Failed to fetch Skysirv Live aircraft positions by bounds",
        )

        return reply.status(getCiriumLiveAircraftErrorStatus(error)).send(
          getCiriumLiveAircraftErrorBody({
            error,
            fallbackMessage:
              "Failed to fetch Skysirv Live aircraft positions by bounds",
            emptyAircraftValue: [],
          }),
        )
      }
    },
  )

  app.get(
    "/skysirv-live/aircraft/regions/:regionKey/positions",
    async (request, reply) => {
      const { regionKey } = request.params as {
        regionKey?: string
      }

      const { maxAircraft } = request.query as {
        maxAircraft?: string
      }

      const parsedMaxAircraft = parseOptionalNumber(maxAircraft)

      if (!regionKey?.trim()) {
        return reply.status(400).send({
          ok: false,
          error: "regionKey is required",
          aircraft: [],
        })
      }

      if (parsedMaxAircraft === null) {
        return reply.status(400).send({
          ok: false,
          error: "maxAircraft must be a valid number",
          aircraft: [],
        })
      }

      const normalizedRegionKey = regionKey.trim().toLowerCase()
      const cacheKey = getLiveAircraftRegionCacheKey({
        regionKey: normalizedRegionKey,
        maxAircraft: parsedMaxAircraft,
      })

      const now = Date.now()
      const cachedResponse = liveAircraftRegionPositionsCache.get(cacheKey)

      if (cachedResponse && cachedResponse.expiresAt > now) {
        return reply
          .header("Cache-Control", "no-store")
          .header("X-Skysirv-Live-Aircraft-Cache", "hit")
          .send(cachedResponse.data)
      }

      try {
        if (!canUseCiriumLiveAircraft()) {
          return reply
            .status(503)
            .send(getCiriumLiveAircraftDisabledBody([]))
        }

        const aircraft = await getCiriumLiveAircraftRegionPositions({
          regionKey: normalizedRegionKey,
          maxAircraft: parsedMaxAircraft,
        })

        const responseBody: SkysirvLiveAircraftRegionPositionsResponse = {
          ok: true,
          source: "Cirium",
          mode: "positions",
          observedAt: new Date().toISOString(),
          regionKey: normalizedRegionKey,
          cacheTtlSeconds: Math.round(
            SKYSIRV_LIVE_AIRCRAFT_POSITIONS_CACHE_TTL_MS / 1000,
          ),
          aircraft,
        }

        liveAircraftRegionPositionsCache.set(cacheKey, {
          expiresAt: now + SKYSIRV_LIVE_AIRCRAFT_POSITIONS_CACHE_TTL_MS,
          staleUntil:
            now +
            SKYSIRV_LIVE_AIRCRAFT_POSITIONS_CACHE_TTL_MS +
            SKYSIRV_LIVE_AIRCRAFT_STALE_TTL_MS,
          data: responseBody,
        })

        return reply
          .header("Cache-Control", "no-store")
          .header("X-Skysirv-Live-Aircraft-Cache", "miss")
          .send(responseBody)
      } catch (error) {
        app.log.error(
          { error, ...getCiriumLiveAircraftErrorLogContext(error) },
          "Failed to fetch Skysirv Live regional aircraft positions",
        )

        if (cachedResponse && cachedResponse.staleUntil > now) {
          return reply
            .header("Cache-Control", "no-store")
            .header("X-Skysirv-Live-Aircraft-Cache", "stale")
            .send(cachedResponse.data)
        }

        return reply.status(getCiriumLiveAircraftErrorStatus(error)).send(
          getCiriumLiveAircraftErrorBody({
            error,
            fallbackMessage:
              "Failed to fetch Skysirv Live regional aircraft positions",
            emptyAircraftValue: [],
          }),
        )
      }
    },
  )

  app.get(
    "/skysirv-live/aircraft/regions/:regionKey/enriched",
    async (request, reply) => {
      const { regionKey } = request.params as {
        regionKey?: string
      }

      const { maxAircraft } = request.query as {
        maxAircraft?: string
      }

      const parsedMaxAircraft = parseOptionalNumber(maxAircraft)

      if (!regionKey?.trim()) {
        return reply.status(400).send({
          ok: false,
          error: "regionKey is required",
          aircraft: [],
        })
      }

      if (parsedMaxAircraft === null) {
        return reply.status(400).send({
          ok: false,
          error: "maxAircraft must be a valid number",
          aircraft: [],
        })
      }

      const normalizedRegionKey = regionKey.trim().toLowerCase()
      const cacheKey = getLiveAircraftRegionCacheKey({
        regionKey: normalizedRegionKey,
        maxAircraft: parsedMaxAircraft,
      })

      const now = Date.now()
      const cachedResponse = liveAircraftRegionEnrichedCache.get(cacheKey)

      if (cachedResponse && cachedResponse.expiresAt > now) {
        return reply
          .header("Cache-Control", "no-store")
          .header("X-Skysirv-Live-Aircraft-Cache", "hit")
          .send(cachedResponse.data)
      }

      try {
        if (!canUseCiriumLiveAircraft()) {
          return reply
            .status(503)
            .send(getCiriumLiveAircraftDisabledBody([]))
        }

        const aircraft =
          await getCiriumLiveAircraftRegionPositionsWithTrackDetails({
            regionKey: normalizedRegionKey,
            maxAircraft: parsedMaxAircraft,
          })

        const responseBody: SkysirvLiveAircraftRegionEnrichedResponse = {
          ok: true,
          source: "Cirium",
          mode: "enriched",
          observedAt: new Date().toISOString(),
          regionKey: normalizedRegionKey,
          cacheTtlSeconds: Math.round(
            SKYSIRV_LIVE_AIRCRAFT_ENRICHED_CACHE_TTL_MS / 1000,
          ),
          aircraft,
        }

        liveAircraftRegionEnrichedCache.set(cacheKey, {
          expiresAt: now + SKYSIRV_LIVE_AIRCRAFT_ENRICHED_CACHE_TTL_MS,
          staleUntil:
            now +
            SKYSIRV_LIVE_AIRCRAFT_ENRICHED_CACHE_TTL_MS +
            SKYSIRV_LIVE_AIRCRAFT_STALE_TTL_MS,
          data: responseBody,
        })

        return reply
          .header("Cache-Control", "no-store")
          .header("X-Skysirv-Live-Aircraft-Cache", "miss")
          .send(responseBody)
      } catch (error) {
        app.log.error(
          { error, ...getCiriumLiveAircraftErrorLogContext(error) },
          "Failed to fetch Skysirv Live enriched regional aircraft",
        )

        if (cachedResponse && cachedResponse.staleUntil > now) {
          return reply
            .header("Cache-Control", "no-store")
            .header("X-Skysirv-Live-Aircraft-Cache", "stale")
            .send(cachedResponse.data)
        }

        return reply.status(getCiriumLiveAircraftErrorStatus(error)).send(
          getCiriumLiveAircraftErrorBody({
            error,
            fallbackMessage:
              "Failed to fetch Skysirv Live enriched regional aircraft",
            emptyAircraftValue: [],
          }),
        )
      }
    },
  )

  app.get("/skysirv-live/aircraft/track/:flightId", async (request, reply) => {
    try {
      if (!canUseCiriumLiveAircraft()) {
        return reply
          .status(503)
          .send(getCiriumLiveAircraftDisabledBody(null))
      }
      const { flightId } = request.params as {
        flightId?: string
      }

      const { maxPositions } = request.query as {
        maxPositions?: string
      }

      const parsedMaxPositions = parseOptionalNumber(maxPositions)

      if (!flightId?.trim()) {
        return reply.status(400).send({
          ok: false,
          error: "flightId is required",
          aircraft: null,
        })
      }

      if (parsedMaxPositions === null) {
        return reply.status(400).send({
          ok: false,
          error: "maxPositions must be a valid number",
          aircraft: null,
        })
      }

      const aircraft = await getCiriumLiveAircraftTrackDetails({
        flightId,
        maxPositions: parsedMaxPositions,
      })

      if (!aircraft) {
        return reply.status(404).send({
          ok: false,
          error: "Aircraft track details were not found",
          aircraft: null,
        })
      }

      return reply.header("Cache-Control", "no-store").send({
        ok: true,
        source: "Cirium",
        observedAt: new Date().toISOString(),
        aircraft,
      })
    } catch (error) {
      app.log.error(
        { error, ...getCiriumLiveAircraftErrorLogContext(error) },
        "Failed to fetch Skysirv Live aircraft track",
      )

      return reply.status(getCiriumLiveAircraftErrorStatus(error)).send(
        getCiriumLiveAircraftErrorBody({
          error,
          fallbackMessage: "Failed to fetch Skysirv Live aircraft track",
          emptyAircraftValue: null,
        }),
      )
    }
  })

  app.get("/skysirv-live/weather", async (request, reply) => {
    try {
      const { latitude, longitude } = request.query as {
        latitude?: string
        longitude?: string
      }

      const parsedLatitude = parseRequiredNumber(latitude)
      const parsedLongitude = parseRequiredNumber(longitude)

      if (parsedLatitude === null || parsedLongitude === null) {
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