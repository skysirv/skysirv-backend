import { env } from "../../config/env.js"

export type GeocodedLocation = {
  query: string
  name: string
  formattedAddress: string | null
  latitude: number
  longitude: number
  featureType: string | null
}

type MapboxGeocodingFeature = {
  geometry?: {
    type?: string
    coordinates?: unknown
  }
  properties?: {
    feature_type?: string
    name?: string
    name_preferred?: string
    place_formatted?: string
    full_address?: string
    coordinates?: {
      longitude?: number
      latitude?: number
    }
  }
}

type MapboxGeocodingResponse = {
  features?: MapboxGeocodingFeature[]
}

export async function geocodeLocation(
  query: string
): Promise<GeocodedLocation> {
  const cleanQuery = query.trim()

  if (!cleanQuery) {
    throw new Error("Location query is required")
  }

  const url = new URL(
    "https://api.mapbox.com/search/geocode/v6/forward"
  )

  url.searchParams.set("q", cleanQuery)
  url.searchParams.set(
    "types",
    "place,locality,neighborhood,district,region"
  )
  url.searchParams.set("limit", "1")
  url.searchParams.set(
    "access_token",
    env.MAPBOX_ACCESS_TOKEN
  )

  const response = await fetch(url)

  const data =
    (await response.json().catch(() => null)) as
    | MapboxGeocodingResponse
    | null

  if (!response.ok) {
    throw new Error(
      `Mapbox geocoding failed with status ${response.status}`
    )
  }

  const feature = data?.features?.[0]

  if (!feature) {
    throw new Error(
      `No matching location found for "${cleanQuery}"`
    )
  }

  const propertyLongitude =
    feature.properties?.coordinates?.longitude

  const propertyLatitude =
    feature.properties?.coordinates?.latitude

  const geometryCoordinates =
    Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry?.coordinates
      : []

  const longitude =
    typeof propertyLongitude === "number"
      ? propertyLongitude
      : typeof geometryCoordinates?.[0] === "number"
        ? geometryCoordinates[0]
        : null

  const latitude =
    typeof propertyLatitude === "number"
      ? propertyLatitude
      : typeof geometryCoordinates?.[1] === "number"
        ? geometryCoordinates[1]
        : null

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    throw new Error(
      `Mapbox returned no usable coordinates for "${cleanQuery}"`
    )
  }

  const name =
    feature.properties?.name_preferred?.trim() ||
    feature.properties?.name?.trim() ||
    cleanQuery

  const formattedAddress =
    feature.properties?.full_address?.trim() ||
    feature.properties?.place_formatted?.trim() ||
    null

  return {
    query: cleanQuery,
    name,
    formattedAddress,
    latitude,
    longitude,
    featureType:
      feature.properties?.feature_type ?? null,
  }
}