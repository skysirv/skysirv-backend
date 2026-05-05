import { FastifyInstance } from "fastify"

import { env } from "../config/env.js"

type AirportSearchAnchor = {
  id: string
  label: string
  latitude: number
  longitude: number
}

type AirportCoordinates = {
  code: string
  name: string
  latitude: number
  longitude: number
  searchAnchors: AirportSearchAnchor[]
}

type IndoorSearchResult = {
  id: string
  name: string
  type: string
  floorId?: string
  coordinates: [number, number]
}

type GeoJsonGeometry = {
  type: string
  coordinates?: unknown
}

type TilequeryFeature = {
  id?: string | number
  type: "Feature"
  geometry?: GeoJsonGeometry
  properties?: Record<string, unknown>
}

type TilequeryResponse = {
  type: "FeatureCollection"
  features?: TilequeryFeature[]
}

type ScoredIndoorSearchResult = {
  score: number
  result: IndoorSearchResult
}

const AIRPORT_COORDINATES: Record<string, AirportCoordinates> = {
  MIA: {
    code: "MIA",
    name: "Miami International Airport",
    latitude: 25.7959,
    longitude: -80.287,
    searchAnchors: [
      {
        id: "mia-north-terminal-d",
        label: "North Terminal D",
        latitude: 25.7971,
        longitude: -80.2871,
      },
      {
        id: "mia-central-terminal-e-f",
        label: "Central Terminal E/F",
        latitude: 25.7938,
        longitude: -80.2798,
      },
      {
        id: "mia-central-terminal-g",
        label: "Central Terminal G",
        latitude: 25.7942,
        longitude: -80.2757,
      },
      {
        id: "mia-south-terminal-h-j",
        label: "South Terminal H/J",
        latitude: 25.7924,
        longitude: -80.2709,
      },
      {
        id: "mia-south-terminal-j-west",
        label: "South Terminal J West",
        latitude: 25.7918,
        longitude: -80.2746,
      },
      {
        id: "mia-south-terminal-j-center",
        label: "South Terminal J Center",
        latitude: 25.7913,
        longitude: -80.2732,
      },
      {
        id: "mia-south-terminal-j-east",
        label: "South Terminal J East",
        latitude: 25.7908,
        longitude: -80.2718,
      },
      {
        id: "mia-south-terminal-h",
        label: "South Terminal H",
        latitude: 25.7932,
        longitude: -80.2762,
      },
    ],
  },
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function isLngLatCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  )
}

function isLngLatCoordinateArray(value: unknown): value is [number, number][] {
  return Array.isArray(value) && value.every(isLngLatCoordinate)
}

function isLngLatPolygon(value: unknown): value is [number, number][][] {
  return Array.isArray(value) && value.every(isLngLatCoordinateArray)
}

function getPropertyString(
  properties: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = properties[key]

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim()
    }

    if (typeof value === "number") {
      return String(value)
    }
  }

  return ""
}

function getFeatureCoordinates(feature: TilequeryFeature): [number, number] | null {
  const geometry = feature.geometry

  if (!geometry) return null

  if (geometry.type === "Point" && isLngLatCoordinate(geometry.coordinates)) {
    return geometry.coordinates
  }

  if (
    geometry.type === "LineString" &&
    isLngLatCoordinateArray(geometry.coordinates)
  ) {
    return geometry.coordinates[0] ?? null
  }

  if (geometry.type === "Polygon" && isLngLatPolygon(geometry.coordinates)) {
    const firstRing = geometry.coordinates[0]
    const firstCoordinate = firstRing?.[0]

    return firstCoordinate ?? null
  }

  return null
}

function scoreIndoorFeature(
  feature: TilequeryFeature,
  query: string
): ScoredIndoorSearchResult | null {
  const properties = feature.properties ?? {}

  const name = getPropertyString(properties, [
    "name",
    "name_en",
    "display_name",
    "label",
  ])

  const ref = getPropertyString(properties, ["ref", "gate", "gate_id"])
  const type = getPropertyString(properties, ["type", "class", "maki"])
  const floorId = getPropertyString(properties, [
    "floor_id",
    "floorId",
    "level",
    "floor",
  ])

  const normalizedQuery = normalizeSearchValue(query)
  const normalizedName = normalizeSearchValue(name)
  const normalizedRef = normalizeSearchValue(ref)
  const normalizedType = normalizeSearchValue(type)

  let score = 0

  if (normalizedRef === normalizedQuery) score += 100
  if (normalizedName === normalizedQuery) score += 95

  if (normalizedRef.startsWith(normalizedQuery)) score += 80
  if (normalizedName.startsWith(normalizedQuery)) score += 70

  if (normalizedRef.includes(normalizedQuery)) score += 55
  if (normalizedName.includes(normalizedQuery)) score += 50
  if (normalizedType.includes(normalizedQuery)) score += 25

  const combined = [normalizedName, normalizedRef, normalizedType]
    .filter(Boolean)
    .join(" ")

  if (!combined.includes(normalizedQuery)) {
    return null
  }

  const coordinates = getFeatureCoordinates(feature)

  if (!coordinates) {
    return null
  }

  const resultName = name || ref || "Indoor location"
  const resultType = type || "indoor"

  return {
    score,
    result: {
      id: String(feature.id ?? `${resultName}-${coordinates.join(",")}`),
      name: resultName,
      type: resultType,
      floorId: floorId || undefined,
      coordinates,
    } satisfies IndoorSearchResult,
  }
}

async function fetchIndoorFeaturesForAnchor(anchor: AirportSearchAnchor) {
  const url = new URL(
    `https://api.mapbox.com/v4/mapbox.indoor-v3/tilequery/${anchor.longitude},${anchor.latitude}.json`
  )

  url.searchParams.set("access_token", env.MAPBOX_ACCESS_TOKEN)
  url.searchParams.set("radius", "2000")
  url.searchParams.set("limit", "50")
  url.searchParams.set("layers", "indoor_label,indoor_floorplan")

  const response = await fetch(url)

  if (!response.ok) {
    const details = await response.text()

    throw new Error(
      `Mapbox Tilequery failed for ${anchor.id}: ${response.status} ${details}`
    )
  }

  const data = (await response.json()) as TilequeryResponse

  return data.features ?? []
}

function dedupeIndoorResults(results: IndoorSearchResult[]) {
  const seen = new Set<string>()

  return results.filter((result) => {
    const key = [
      normalizeSearchValue(result.name),
      normalizeSearchValue(result.type),
      result.floorId ?? "",
      result.coordinates.join(","),
    ].join("|")

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

export async function airportRoutes(app: FastifyInstance) {
  app.get("/airports/:code/indoor-search", async (request, reply) => {
    const { code } = request.params as { code: string }
    const { q } = request.query as { q?: string }

    const airportCode = code.trim().toUpperCase()
    const query = q?.trim() ?? ""

    if (!query) {
      return []
    }

    const airport = AIRPORT_COORDINATES[airportCode]

    if (!airport) {
      return reply.code(404).send({
        error: "Airport not supported",
        message: `${airportCode} is not configured for indoor airport search yet.`,
      })
    }

    let features: TilequeryFeature[] = []

    try {
      const featureGroups = await Promise.all(
        airport.searchAnchors.map(async (anchor) => {
          const anchorFeatures = await fetchIndoorFeaturesForAnchor(anchor)

          return {
            anchor,
            features: anchorFeatures,
          }
        })
      )

      features = featureGroups.flatMap((group) => group.features)
    } catch (error) {
      request.log.error(
        {
          error,
          airportCode,
          query,
        },
        "Mapbox indoor Tilequery request failed"
      )

      return reply.code(502).send({
        error: "Indoor search unavailable",
        message: "Mapbox indoor search request failed.",
      })
    }

    console.log("🧭 MAPBOX INDOOR TILEQUERY DEBUG", {
      airportCode,
      query,
      featureCount: features.length,
      sampleFeatures: features.slice(0, 10).map((feature) => ({
        id: feature.id,
        geometryType: feature.geometry?.type,
        coordinates: getFeatureCoordinates(feature),
        properties: feature.properties,
      })),
    })

    const scoredResults = features
      .map((feature) => scoreIndoorFeature(feature, query))
      .filter((item): item is ScoredIndoorSearchResult => item !== null)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.result)

    return dedupeIndoorResults(scoredResults).slice(0, 8)
  })
}