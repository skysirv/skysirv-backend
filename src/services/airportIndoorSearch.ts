import { sql } from "kysely"

import { env } from "../config/env.js"
import { db } from "../db/kysely.js"
import {
  getAirportIndoorBounds,
  getSupportedAirportIndoorBounds,
} from "../data/airportIndoorBounds.js"

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

type IndexedIndoorFeature = {
  mapboxFeatureId: string | null
  name: string
  normalizedName: string
  type: string | null
  class: string | null
  floorId: string | null
  longitude: number
  latitude: number
  rawFeatureJson: TilequeryFeature
}

type ScoredIndoorSearchResult = {
  score: number
  result: IndoorSearchResult
}

const INDEX_MAX_AGE_HOURS = 24 * 14
const TILEQUERY_RADIUS_METERS = 1000
const TILEQUERY_LIMIT = 50

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

function generateAirportGridPoints(code: string) {
  const airport = getAirportIndoorBounds(code)

  if (!airport) return null

  const points: Array<{ latitude: number; longitude: number }> = []

  const latitudeStep =
    airport.grid.rows > 1
      ? (airport.bounds.north - airport.bounds.south) / (airport.grid.rows - 1)
      : 0

  const longitudeStep =
    airport.grid.columns > 1
      ? (airport.bounds.east - airport.bounds.west) /
      (airport.grid.columns - 1)
      : 0

  for (let row = 0; row < airport.grid.rows; row += 1) {
    for (let column = 0; column < airport.grid.columns; column += 1) {
      points.push({
        latitude: airport.bounds.south + latitudeStep * row,
        longitude: airport.bounds.west + longitudeStep * column,
      })
    }
  }

  return points
}

async function fetchIndoorFeaturesForPoint(point: {
  latitude: number
  longitude: number
}) {
  const url = new URL(
    `https://api.mapbox.com/v4/mapbox.indoor-v3/tilequery/${point.longitude},${point.latitude}.json`
  )

  url.searchParams.set("access_token", env.MAPBOX_ACCESS_TOKEN)
  url.searchParams.set("radius", String(TILEQUERY_RADIUS_METERS))
  url.searchParams.set("limit", String(TILEQUERY_LIMIT))
  url.searchParams.set("layers", "indoor_label,indoor_floorplan")

  const response = await fetch(url)

  if (!response.ok) {
    const details = await response.text()

    throw new Error(
      `Mapbox Tilequery failed: ${response.status} ${details}`
    )
  }

  const data = (await response.json()) as TilequeryResponse

  return data.features ?? []
}

function toIndexedIndoorFeature(feature: TilequeryFeature): IndexedIndoorFeature | null {
  const properties = feature.properties ?? {}

  const name = getPropertyString(properties, [
    "name",
    "name_en",
    "display_name",
    "label",
    "ref",
    "gate",
    "gate_id",
  ])

  if (!name) return null

  const coordinates = getFeatureCoordinates(feature)

  if (!coordinates) return null

  const type = getPropertyString(properties, ["type", "class", "maki"])
  const featureClass = getPropertyString(properties, ["class", "category"])
  const floorId = getPropertyString(properties, [
    "floor_id",
    "floorId",
    "level",
    "floor",
  ])

  return {
    mapboxFeatureId: feature.id != null ? String(feature.id) : null,
    name,
    normalizedName: normalizeSearchValue(name),
    type: type || null,
    class: featureClass || null,
    floorId: floorId || null,
    longitude: coordinates[0],
    latitude: coordinates[1],
    rawFeatureJson: feature,
  }
}

function dedupeIndexedFeatures(features: IndexedIndoorFeature[]) {
  const seen = new Set<string>()

  return features.filter((feature) => {
    const key = [
      feature.normalizedName,
      feature.type ?? "",
      feature.class ?? "",
      feature.floorId ?? "",
      feature.longitude.toFixed(6),
      feature.latitude.toFixed(6),
    ].join("|")

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

async function getFreshFeatureCount(airportCode: string) {
  const row = await db
    .selectFrom("airport_indoor_features")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("airport_code", "=", airportCode)
    .where(
      "updated_at",
      ">",
      sql<Date>`now() - (${INDEX_MAX_AGE_HOURS} || ' hours')::interval`
    )
    .executeTakeFirst()

  return Number(row?.count ?? 0)
}

export async function refreshAirportIndoorIndex(airportCode: string) {
  const points = generateAirportGridPoints(airportCode)

  if (!points) {
    return {
      supported: false,
      featureCount: 0,
    }
  }

  const featureGroups = await Promise.all(
    points.map((point) => fetchIndoorFeaturesForPoint(point))
  )

  const indexedFeatures = dedupeIndexedFeatures(
    featureGroups
      .flat()
      .map((feature) => toIndexedIndoorFeature(feature))
      .filter((feature): feature is IndexedIndoorFeature => feature !== null)
  )

  if (indexedFeatures.length === 0) {
    return {
      supported: true,
      featureCount: 0,
    }
  }

  await db
    .deleteFrom("airport_indoor_features")
    .where("airport_code", "=", airportCode)
    .execute()

  await db
    .insertInto("airport_indoor_features")
    .values(
      indexedFeatures.map((feature) => ({
        airport_code: airportCode,
        mapbox_feature_id: feature.mapboxFeatureId,
        name: feature.name,
        normalized_name: feature.normalizedName,
        type: feature.type,
        class: feature.class,
        floor_id: feature.floorId,
        longitude: feature.longitude,
        latitude: feature.latitude,
        source: "mapbox",
        raw_feature_json: feature.rawFeatureJson,
        last_seen_at: new Date(),
        updated_at: new Date(),
      }))
    )
    .execute()

  return {
    supported: true,
    featureCount: indexedFeatures.length,
  }
}

function scoreCachedIndoorFeature(
  feature: {
    id?: string
    name: string
    normalized_name: string
    type: string | null
    class: string | null
    floor_id: string | null
    longitude: number
    latitude: number
  },
  query: string
): ScoredIndoorSearchResult | null {
  const normalizedQuery = normalizeSearchValue(query)
  const normalizedName = normalizeSearchValue(feature.normalized_name)
  const normalizedType = normalizeSearchValue(feature.type)
  const normalizedClass = normalizeSearchValue(feature.class)

  const combined = [normalizedName, normalizedType, normalizedClass]
    .filter(Boolean)
    .join(" ")

  if (!combined.includes(normalizedQuery)) {
    return null
  }

  let score = 0

  if (normalizedName === normalizedQuery) score += 100
  if (normalizedName.startsWith(normalizedQuery)) score += 80
  if (normalizedName.includes(normalizedQuery)) score += 60
  if (normalizedType.includes(normalizedQuery)) score += 25
  if (normalizedClass.includes(normalizedQuery)) score += 20

  return {
    score,
    result: {
      id: feature.id ?? `${feature.name}-${feature.longitude},${feature.latitude}`,
      name: feature.name,
      type: feature.type || feature.class || "indoor",
      floorId: feature.floor_id || undefined,
      coordinates: [feature.longitude, feature.latitude],
    },
  }
}

export async function searchAirportIndoorFeatures({
  airportCode,
  query,
}: {
  airportCode: string
  query: string
}) {
  const normalizedAirportCode = airportCode.trim().toUpperCase()
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return {
      supported: true,
      results: [] as IndoorSearchResult[],
    }
  }

  const airport = getAirportIndoorBounds(normalizedAirportCode)

  if (!airport) {
    return {
      supported: false,
      results: [] as IndoorSearchResult[],
    }
  }

  const freshFeatureCount = await getFreshFeatureCount(normalizedAirportCode)

  if (freshFeatureCount === 0) {
    await refreshAirportIndoorIndex(normalizedAirportCode)
  }

  const cachedFeatures = await db
    .selectFrom("airport_indoor_features")
    .select([
      "id",
      "name",
      "normalized_name",
      "type",
      "class",
      "floor_id",
      "longitude",
      "latitude",
    ])
    .where("airport_code", "=", normalizedAirportCode)
    .execute()

  let results = cachedFeatures
    .map((feature) => scoreCachedIndoorFeature(feature, normalizedQuery))
    .filter((item): item is ScoredIndoorSearchResult => item !== null)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.result)
    .slice(0, 8)

  if (results.length === 0 && freshFeatureCount > 0) {
    await refreshAirportIndoorIndex(normalizedAirportCode)

    const rebuiltFeatures = await db
      .selectFrom("airport_indoor_features")
      .select([
        "id",
        "name",
        "normalized_name",
        "type",
        "class",
        "floor_id",
        "longitude",
        "latitude",
      ])
      .where("airport_code", "=", normalizedAirportCode)
      .execute()

    results = rebuiltFeatures
      .map((feature) => scoreCachedIndoorFeature(feature, normalizedQuery))
      .filter((item): item is ScoredIndoorSearchResult => item !== null)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.result)
      .slice(0, 8)
  }

  return {
    supported: true,
    results,
  }
}

export async function getAirportIndoorIndexStatus(airportCode: string) {
  const normalizedAirportCode = airportCode.trim().toUpperCase()
  const airport = getAirportIndoorBounds(normalizedAirportCode)

  if (!airport) {
    return {
      supported: false,
      airportCode: normalizedAirportCode,
      featureCount: 0,
      stale: true,
      oldestUpdatedAt: null as Date | null,
      newestUpdatedAt: null as Date | null,
    }
  }

  const row = await db
    .selectFrom("airport_indoor_features")
    .select(({ fn }) => [
      fn.countAll<number>().as("feature_count"),
      fn.min<Date>("updated_at").as("oldest_updated_at"),
      fn.max<Date>("updated_at").as("newest_updated_at"),
    ])
    .where("airport_code", "=", normalizedAirportCode)
    .executeTakeFirst()

  const featureCount = Number(row?.feature_count ?? 0)
  const newestUpdatedAt = row?.newest_updated_at ?? null
  const oldestUpdatedAt = row?.oldest_updated_at ?? null

  const freshFeatureCount = await getFreshFeatureCount(normalizedAirportCode)

  return {
    supported: true,
    airportCode: normalizedAirportCode,
    featureCount,
    stale: freshFeatureCount === 0,
    oldestUpdatedAt,
    newestUpdatedAt,
  }
}

export async function getAllAirportIndoorIndexStatuses() {
  const airports = getSupportedAirportIndoorBounds()

  const statuses = await Promise.all(
    airports.map((airport) => getAirportIndoorIndexStatus(airport.code))
  )

  return statuses
}