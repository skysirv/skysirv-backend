import { env } from "../config/env.js"

type CiriumErrorResponse = {
  error?: {
    id?: string
    code?: string
    message?: string
    status?: number
  }
}

export class CiriumLiveAircraftApiError extends Error {
  statusCode: number
  code: string | null
  providerMessage: string | null
  requestUrl: string | null

  constructor(params: {
    statusCode: number
    statusText: string
    code?: string | null
    providerMessage?: string | null
    requestUrl?: string | null
  }) {
    super(
      params.providerMessage ??
      `Cirium live aircraft request failed with ${params.statusCode} ${params.statusText}`,
    )

    this.name = "CiriumLiveAircraftApiError"
    this.statusCode = params.statusCode
    this.code = params.code ?? null
    this.providerMessage = params.providerMessage ?? null
    this.requestUrl = params.requestUrl ?? null
  }
}

type CiriumFlightPositionResponse = {
  request?: unknown
  appendix?: unknown
  flightPositions?: CiriumFlightPosition[]
}

type CiriumFlightPosition = {
  flightId?: number | string
  callsign?: string
  tailNumber?: string
  source?: string
  heading?: number
  positions?: CiriumAircraftPositionPoint[]
}

type CiriumAircraftPositionPoint = {
  lon?: number
  lat?: number
  speedMph?: number
  altitudeFt?: number
  source?: string
  date?: string
}

type CiriumFlightTrackResponse = {
  request?: unknown
  appendix?: CiriumFlightTrackAppendix
  flightTrack?: CiriumFlightTrack
}

type CiriumFlightTrackAppendix = {
  airlines?: CiriumAirline[] | CiriumAirline
  airports?: CiriumAirport[] | CiriumAirport
  equipments?: CiriumEquipment[] | CiriumEquipment
}

type CiriumAirline = {
  fs?: string
  iata?: string
  icao?: string
  name?: string
  active?: boolean
}

type CiriumAirport = {
  fs?: string
  iata?: string
  icao?: string
  faa?: string
  name?: string
  city?: string
  countryCode?: string
  countryName?: string
  latitude?: number
  longitude?: number
  timeZoneRegionName?: string
  localTime?: string
  utcOffsetHours?: number
}

type CiriumEquipment = {
  iata?: string
  name?: string
  turboProp?: boolean
  jet?: boolean
  widebody?: boolean
  regional?: boolean
}

type CiriumFlightTrack = {
  flightId?: number | string
  carrierFsCode?: string
  flightNumber?: string
  tailNumber?: string
  callsign?: string
  departureAirportFsCode?: string
  arrivalAirportFsCode?: string
  departureDate?: {
    dateUtc?: string
    dateLocal?: string
  }
  equipment?: string
  delayMinutes?: number
  bearing?: number
  heading?: number
  positions?: CiriumAircraftPositionPoint[]
}

export type SkysirvLiveAircraft = {
  id: string
  flightId: string
  callsign: string
  flightNumber: string
  tailNumber: string | null
  latitude: number
  longitude: number
  heading: number | null
  speedMph: number | null
  altitudeFeet: number | null
  observedAt: string | null
  source: "Cirium"
}

export type SkysirvLiveAircraftTrackPosition = {
  latitude: number
  longitude: number
  speedMph: number | null
  altitudeFeet: number | null
  observedAt: string | null
  source: string | null
}

export type SkysirvLiveAircraftTrackDetails = {
  id: string
  flightId: string
  carrierFsCode: string | null
  flightNumber: string
  callsign: string
  airlineName: string | null
  tailNumber: string | null
  aircraftType: string | null
  equipmentCode: string | null
  originCode: string | null
  originName: string | null
  originCity: string | null
  originCountry: string | null
  originLatitude: number | null
  originLongitude: number | null
  destinationCode: string | null
  destinationName: string | null
  destinationCity: string | null
  destinationCountry: string | null
  destinationLatitude: number | null
  destinationLongitude: number | null
  departureDateUtc: string | null
  departureDateLocal: string | null
  delayMinutes: number | null
  bearing: number | null
  heading: number | null
  positions: SkysirvLiveAircraftTrackPosition[]
  source: "Cirium"
}

export type SkysirvLiveAircraftWithTrackDetails = SkysirvLiveAircraft & {
  carrierFsCode: string | null
  airlineName: string
  aircraftType: string
  equipmentCode: string | null
  originCode: string
  originName: string | null
  originCity: string
  originCountry: string | null
  destinationCode: string
  destinationName: string | null
  destinationCity: string
  destinationCountry: string | null
  departureDateUtc: string | null
  departureDateLocal: string | null
  delayMinutes: number
  routeProgressPercent: number | null
}

type SkysirvLiveAircraftBoundingBox = {
  topLatitude: number
  leftLongitude: number
  bottomLatitude: number
  rightLongitude: number
}

type SkysirvLiveAircraftRegionKey =
  | "all"
  | "north-america"
  | "europe"
  | "asia"
  | "africa"
  | "south-america"
  | "middle-east"
  | "pacific"

const CIRIUM_LIVE_AIRCRAFT_REQUEST_TIMEOUT_MS = 12_000
const CIRIUM_AIRCRAFT_TRACK_CACHE_TTL_MS = 90_000
const CIRIUM_LIVE_AIRCRAFT_QUOTA_ERROR = "quota_exceeded"

function shouldRethrowCiriumLiveAircraftError(error: unknown) {
  if (!(error instanceof CiriumLiveAircraftApiError)) return false

  return (
    error.code === CIRIUM_LIVE_AIRCRAFT_QUOTA_ERROR ||
    error.statusCode === 401 ||
    error.statusCode === 403 ||
    error.statusCode === 429
  )
}
const CIRIUM_BOUNDING_BOX_MAX_DEGREES = 5
const DEFAULT_MAX_AIRCRAFT = 40
const DEFAULT_MAX_TILES = 24
const DEFAULT_MAX_FLIGHTS_PER_TILE = 3
const MIN_AIRBORNE_ALTITUDE_FEET = 500
const MIN_AIRBORNE_SPEED_MPH = 80
const TRACK_ENRICHMENT_CONCURRENCY = 6

const LIVE_AIRCRAFT_REGION_BOUNDS: Record<
  SkysirvLiveAircraftRegionKey,
  SkysirvLiveAircraftBoundingBox
> = {
  all: {
    topLatitude: 72,
    leftLongitude: -170,
    bottomLatitude: -50,
    rightLongitude: 170,
  },
  "north-america": {
    topLatitude: 49,
    leftLongitude: -124,
    bottomLatitude: 30,
    rightLongitude: -67,
  },
  europe: {
    topLatitude: 72,
    leftLongitude: -25,
    bottomLatitude: 34,
    rightLongitude: 45,
  },
  asia: {
    topLatitude: 60,
    leftLongitude: 65,
    bottomLatitude: -10,
    rightLongitude: 150,
  },
  africa: {
    topLatitude: 38,
    leftLongitude: -20,
    bottomLatitude: -38,
    rightLongitude: 55,
  },
  "south-america": {
    topLatitude: 15,
    leftLongitude: -90,
    bottomLatitude: -58,
    rightLongitude: -30,
  },
  "middle-east": {
    topLatitude: 42,
    leftLongitude: 34,
    bottomLatitude: 12,
    rightLongitude: 65,
  },
  pacific: {
    topLatitude: -24,
    leftLongitude: 130,
    bottomLatitude: -47,
    rightLongitude: 178,
  },
}

const LIVE_AIRCRAFT_REGION_FOCUS_BOUNDS: Partial<
  Record<SkysirvLiveAircraftRegionKey, SkysirvLiveAircraftBoundingBox[]>
> = {
  all: [
    // North Atlantic: North America ↔ Europe tracks
    { topLatitude: 55, leftLongitude: -65, bottomLatitude: 50, rightLongitude: -60 },
    { topLatitude: 55, leftLongitude: -55, bottomLatitude: 50, rightLongitude: -50 },
    { topLatitude: 55, leftLongitude: -45, bottomLatitude: 50, rightLongitude: -40 },
    { topLatitude: 55, leftLongitude: -35, bottomLatitude: 50, rightLongitude: -30 },
    { topLatitude: 55, leftLongitude: -25, bottomLatitude: 50, rightLongitude: -20 },

    // U.S. East Coast / Caribbean / transatlantic departure corridor
    { topLatitude: 43, leftLongitude: -76, bottomLatitude: 38, rightLongitude: -71 },
    { topLatitude: 35, leftLongitude: -80, bottomLatitude: 30, rightLongitude: -75 },
    { topLatitude: 30, leftLongitude: -78, bottomLatitude: 25, rightLongitude: -73 },
    { topLatitude: 25, leftLongitude: -73, bottomLatitude: 20, rightLongitude: -68 },

    // North Pacific: West Coast / Hawaii / Japan corridor
    { topLatitude: 40, leftLongitude: -150, bottomLatitude: 35, rightLongitude: -145 },
    { topLatitude: 35, leftLongitude: -160, bottomLatitude: 30, rightLongitude: -155 },
    { topLatitude: 30, leftLongitude: -165, bottomLatitude: 25, rightLongitude: -160 },
    { topLatitude: 35, leftLongitude: 145, bottomLatitude: 30, rightLongitude: 150 },
    { topLatitude: 40, leftLongitude: 150, bottomLatitude: 35, rightLongitude: 155 },

    // Hawaii / Central Pacific
    { topLatitude: 24, leftLongitude: -160, bottomLatitude: 19, rightLongitude: -155 },
    { topLatitude: 24, leftLongitude: -150, bottomLatitude: 19, rightLongitude: -145 },

    // South Atlantic / South America long-haul corridor
    { topLatitude: 0, leftLongitude: -45, bottomLatitude: -5, rightLongitude: -40 },
    { topLatitude: -5, leftLongitude: -40, bottomLatitude: -10, rightLongitude: -35 },
    { topLatitude: -10, leftLongitude: -35, bottomLatitude: -15, rightLongitude: -30 },

    // Middle East / Indian Ocean / Southeast Asia corridors
    { topLatitude: 25, leftLongitude: 52, bottomLatitude: 20, rightLongitude: 57 },
    { topLatitude: 20, leftLongitude: 60, bottomLatitude: 15, rightLongitude: 65 },
    { topLatitude: 15, leftLongitude: 70, bottomLatitude: 10, rightLongitude: 75 },
    { topLatitude: 10, leftLongitude: 80, bottomLatitude: 5, rightLongitude: 85 },
    { topLatitude: 5, leftLongitude: 95, bottomLatitude: 0, rightLongitude: 100 },

    // Australia / New Zealand / South Pacific
    { topLatitude: -27, leftLongitude: 150, bottomLatitude: -32, rightLongitude: 155 },
    { topLatitude: -33, leftLongitude: 144, bottomLatitude: -38, rightLongitude: 149 },
    { topLatitude: -34, leftLongitude: 135, bottomLatitude: -39, rightLongitude: 140 },
    { topLatitude: -36, leftLongitude: 172, bottomLatitude: -41, rightLongitude: 177 },
    { topLatitude: -41, leftLongitude: 167, bottomLatitude: -46, rightLongitude: 172 },
  ],

  "north-america": [
    { topLatitude: 48, leftLongitude: -124, bottomLatitude: 43, rightLongitude: -119 },
    { topLatitude: 36, leftLongitude: -119, bottomLatitude: 31, rightLongitude: -114 },
    { topLatitude: 42, leftLongitude: -113, bottomLatitude: 37, rightLongitude: -108 },
    { topLatitude: 35, leftLongitude: -100, bottomLatitude: 30, rightLongitude: -95 },
    { topLatitude: 44, leftLongitude: -91, bottomLatitude: 39, rightLongitude: -86 },
    { topLatitude: 36, leftLongitude: -86, bottomLatitude: 31, rightLongitude: -81 },
    { topLatitude: 43, leftLongitude: -78, bottomLatitude: 38, rightLongitude: -73 },
    { topLatitude: 30, leftLongitude: -84, bottomLatitude: 25, rightLongitude: -79 },
  ],
  europe: [
    { topLatitude: 56, leftLongitude: -7, bottomLatitude: 51, rightLongitude: -2 },
    { topLatitude: 44, leftLongitude: -5, bottomLatitude: 39, rightLongitude: 0 },
    { topLatitude: 51, leftLongitude: 0, bottomLatitude: 46, rightLongitude: 5 },
    { topLatitude: 54, leftLongitude: 7, bottomLatitude: 49, rightLongitude: 12 },
    { topLatitude: 48, leftLongitude: 9, bottomLatitude: 43, rightLongitude: 14 },
    { topLatitude: 60, leftLongitude: 10, bottomLatitude: 55, rightLongitude: 15 },
    { topLatitude: 47, leftLongitude: 16, bottomLatitude: 42, rightLongitude: 21 },
    { topLatitude: 43, leftLongitude: 26, bottomLatitude: 38, rightLongitude: 31 },
  ],
  asia: [
    { topLatitude: 39, leftLongitude: 115, bottomLatitude: 34, rightLongitude: 120 },
    { topLatitude: 37, leftLongitude: 136, bottomLatitude: 32, rightLongitude: 141 },
    { topLatitude: 38, leftLongitude: 126, bottomLatitude: 33, rightLongitude: 131 },
    { topLatitude: 25, leftLongitude: 117, bottomLatitude: 20, rightLongitude: 122 },
    { topLatitude: 16, leftLongitude: 98, bottomLatitude: 11, rightLongitude: 103 },
    { topLatitude: 7, leftLongitude: 100, bottomLatitude: 2, rightLongitude: 105 },
    { topLatitude: 29, leftLongitude: 75, bottomLatitude: 24, rightLongitude: 80 },
    { topLatitude: 22, leftLongitude: 72, bottomLatitude: 17, rightLongitude: 77 },
  ],
  africa: [
    { topLatitude: 34, leftLongitude: -8, bottomLatitude: 29, rightLongitude: -3 },
    { topLatitude: 33, leftLongitude: 28, bottomLatitude: 28, rightLongitude: 33 },
    { topLatitude: 8, leftLongitude: -2, bottomLatitude: 3, rightLongitude: 3 },
    { topLatitude: 2, leftLongitude: 35, bottomLatitude: -3, rightLongitude: 40 },
    { topLatitude: -23, leftLongitude: 25, bottomLatitude: -28, rightLongitude: 30 },
    { topLatitude: -31, leftLongitude: 16, bottomLatitude: -36, rightLongitude: 21 },
  ],
  "south-america": [
    { topLatitude: 7, leftLongitude: -77, bottomLatitude: 2, rightLongitude: -72 },
    { topLatitude: -10, leftLongitude: -80, bottomLatitude: -15, rightLongitude: -75 },
    { topLatitude: -20, leftLongitude: -73, bottomLatitude: -25, rightLongitude: -68 },
    { topLatitude: -21, leftLongitude: -48, bottomLatitude: -26, rightLongitude: -43 },
    { topLatitude: -32, leftLongitude: -60, bottomLatitude: -37, rightLongitude: -55 },
    { topLatitude: -11, leftLongitude: -41, bottomLatitude: -16, rightLongitude: -36 },
  ],
  "middle-east": [
    { topLatitude: 27, leftLongitude: 50, bottomLatitude: 22, rightLongitude: 55 },
    { topLatitude: 26, leftLongitude: 44, bottomLatitude: 21, rightLongitude: 49 },
    { topLatitude: 34, leftLongitude: 34, bottomLatitude: 29, rightLongitude: 39 },
    { topLatitude: 30, leftLongitude: 39, bottomLatitude: 25, rightLongitude: 44 },
    { topLatitude: 32, leftLongitude: 52, bottomLatitude: 27, rightLongitude: 57 },
  ],
  pacific: [
    { topLatitude: -27, leftLongitude: 150, bottomLatitude: -32, rightLongitude: 155 },
    { topLatitude: -33, leftLongitude: 144, bottomLatitude: -38, rightLongitude: 149 },
    { topLatitude: -30, leftLongitude: 132, bottomLatitude: -35, rightLongitude: 137 },
    { topLatitude: -35, leftLongitude: 115, bottomLatitude: -40, rightLongitude: 120 },
    { topLatitude: -36, leftLongitude: 172, bottomLatitude: -41, rightLongitude: 177 },
    { topLatitude: -41, leftLongitude: 167, bottomLatitude: -46, rightLongitude: 172 },
  ],
}

const NON_PASSENGER_CARRIER_CODES = new Set([
  "FX",
  "FDX",
  "UPS",
  "5X",
  "IJA",
  "XSR",
  "LXJ",
  "EJA",
  "NJE",
  "CNS",
])

const NON_PASSENGER_AIRLINE_NAME_PARTS = [
  "fedex",
  "ups",
  "airshare",
  "flexjet",
  "netjets",
  "international jet aviation",
  "air transport international",
  "cargo",
  "freight",
]

const aircraftTrackCache = new Map<
  string,
  {
    expiresAt: number
    data: SkysirvLiveAircraftTrackDetails
  }
>()

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function toArray<T>(value: T[] | T | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeCode(value?: string | null) {
  return value?.trim().toUpperCase() || null
}

function clampLatitude(latitude: number) {
  return Math.max(-85, Math.min(85, latitude))
}

function clampLongitude(longitude: number) {
  return Math.max(-180, Math.min(180, longitude))
}

function getLatestPosition(
  positions?: CiriumAircraftPositionPoint[],
): CiriumAircraftPositionPoint | null {
  if (!Array.isArray(positions) || positions.length === 0) return null

  return (
    [...positions]
      .filter((position) => {
        return (
          toFiniteNumber(position.lat) !== null &&
          toFiniteNumber(position.lon) !== null
        )
      })
      .sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0
        const bTime = b.date ? new Date(b.date).getTime() : 0

        return bTime - aTime
      })[0] ?? null
  )
}

function getFallbackFlightNumber(callsign?: string) {
  return callsign?.trim().toUpperCase() || "Unknown"
}

function normalizeCiriumFlightPosition(
  flightPosition: CiriumFlightPosition,
): SkysirvLiveAircraft | null {
  const latestPosition = getLatestPosition(flightPosition.positions)

  if (!latestPosition) return null

  const latitude = toFiniteNumber(latestPosition.lat)
  const longitude = toFiniteNumber(latestPosition.lon)

  if (latitude === null || longitude === null) return null

  const altitudeFeet = toFiniteNumber(latestPosition.altitudeFt)
  const speedMph = toFiniteNumber(latestPosition.speedMph)

  if (
    (altitudeFeet ?? 0) < MIN_AIRBORNE_ALTITUDE_FEET &&
    (speedMph ?? 0) < MIN_AIRBORNE_SPEED_MPH
  ) {
    return null
  }

  const flightId =
    flightPosition.flightId !== undefined && flightPosition.flightId !== null
      ? String(flightPosition.flightId)
      : flightPosition.callsign?.trim().toUpperCase()

  if (!flightId) return null

  const callsign = flightPosition.callsign?.trim().toUpperCase() || flightId

  return {
    id: flightId,
    flightId,
    callsign,
    flightNumber: getFallbackFlightNumber(callsign),
    tailNumber: flightPosition.tailNumber?.trim() || null,
    latitude,
    longitude,
    heading: toFiniteNumber(flightPosition.heading),
    speedMph,
    altitudeFeet,
    observedAt: latestPosition.date ?? null,
    source: "Cirium",
  }
}

function normalizeCiriumTrackPositions(
  positions?: CiriumAircraftPositionPoint[],
): SkysirvLiveAircraftTrackPosition[] {
  if (!Array.isArray(positions)) return []

  return positions
    .map((position) => {
      const latitude = toFiniteNumber(position.lat)
      const longitude = toFiniteNumber(position.lon)

      if (latitude === null || longitude === null) return null

      return {
        latitude,
        longitude,
        speedMph: toFiniteNumber(position.speedMph),
        altitudeFeet: toFiniteNumber(position.altitudeFt),
        observedAt: position.date ?? null,
        source: position.source ?? null,
      }
    })
    .filter(
      (
        position,
      ): position is SkysirvLiveAircraftTrackPosition => position !== null,
    )
    .sort((a, b) => {
      const aTime = a.observedAt ? new Date(a.observedAt).getTime() : 0
      const bTime = b.observedAt ? new Date(b.observedAt).getTime() : 0

      return aTime - bTime
    })
}

function getAirlineByCode(
  airlines: CiriumAirline[],
  carrierFsCode?: string | null,
) {
  const code = normalizeCode(carrierFsCode)

  if (!code) return null

  return (
    airlines.find((airline) => {
      return [airline.fs, airline.iata, airline.icao]
        .map(normalizeCode)
        .includes(code)
    }) ?? null
  )
}

function getAirportByCode(
  airports: CiriumAirport[],
  airportCode?: string | null,
) {
  const code = normalizeCode(airportCode)

  if (!code) return null

  return (
    airports.find((airport) => {
      return [airport.fs, airport.iata, airport.icao, airport.faa]
        .map(normalizeCode)
        .includes(code)
    }) ?? null
  )
}

function getEquipmentByCode(
  equipments: CiriumEquipment[],
  equipmentCode?: string | null,
) {
  const code = normalizeCode(equipmentCode)

  if (!code) return null

  return (
    equipments.find((equipment) => normalizeCode(equipment.iata) === code) ??
    null
  )
}

function getDisplayFlightNumber(params: {
  carrierFsCode: string | null
  flightNumber?: string
  callsign: string
  flightId: string
}) {
  if (params.carrierFsCode && params.flightNumber) {
    return `${params.carrierFsCode}${params.flightNumber}`
  }

  return params.callsign || params.flightId
}

function normalizeCiriumFlightTrack(
  data: CiriumFlightTrackResponse,
): SkysirvLiveAircraftTrackDetails | null {
  const flightTrack = data.flightTrack

  if (!flightTrack) return null

  const flightId =
    flightTrack.flightId !== undefined && flightTrack.flightId !== null
      ? String(flightTrack.flightId)
      : null

  if (!flightId) return null

  const airlines = toArray(data.appendix?.airlines)
  const airports = toArray(data.appendix?.airports)
  const equipments = toArray(data.appendix?.equipments)

  const carrierFsCode = normalizeCode(flightTrack.carrierFsCode)
  const airline = getAirlineByCode(airlines, carrierFsCode)

  const originCode = normalizeCode(flightTrack.departureAirportFsCode)
  const destinationCode = normalizeCode(flightTrack.arrivalAirportFsCode)

  const originAirport = getAirportByCode(airports, originCode)
  const destinationAirport = getAirportByCode(airports, destinationCode)

  const equipmentCode = normalizeCode(flightTrack.equipment)
  const equipment = getEquipmentByCode(equipments, equipmentCode)

  const callsign =
    normalizeCode(flightTrack.callsign) ??
    `${carrierFsCode ?? ""}${flightTrack.flightNumber ?? ""}`.trim() ??
    flightId

  return {
    id: flightId,
    flightId,
    carrierFsCode,
    flightNumber: getDisplayFlightNumber({
      carrierFsCode,
      flightNumber: flightTrack.flightNumber,
      callsign,
      flightId,
    }),
    callsign,
    airlineName: airline?.name ?? null,
    tailNumber: flightTrack.tailNumber?.trim() || null,
    aircraftType: equipment?.name ?? null,
    equipmentCode,
    originCode,
    originName: originAirport?.name ?? null,
    originCity: originAirport?.city ?? null,
    originCountry: originAirport?.countryName ?? null,
    originLatitude: toFiniteNumber(originAirport?.latitude),
    originLongitude: toFiniteNumber(originAirport?.longitude),
    destinationCode,
    destinationName: destinationAirport?.name ?? null,
    destinationCity: destinationAirport?.city ?? null,
    destinationCountry: destinationAirport?.countryName ?? null,
    destinationLatitude: toFiniteNumber(destinationAirport?.latitude),
    destinationLongitude: toFiniteNumber(destinationAirport?.longitude),
    departureDateUtc: flightTrack.departureDate?.dateUtc ?? null,
    departureDateLocal: flightTrack.departureDate?.dateLocal ?? null,
    delayMinutes: toFiniteNumber(flightTrack.delayMinutes),
    bearing: toFiniteNumber(flightTrack.bearing),
    heading: toFiniteNumber(flightTrack.heading),
    positions: normalizeCiriumTrackPositions(flightTrack.positions),
    source: "Cirium",
  }
}

function getSafeCiriumRequestUrl(url: URL) {
  const safeUrl = new URL(url.toString())

  const sensitiveSearchParams = [
    "appId",
    "appKey",
    "apiKey",
    "apikey",
    "key",
    "token",
    "access_token",
  ]

  sensitiveSearchParams.forEach((paramName) => {
    if (safeUrl.searchParams.has(paramName)) {
      safeUrl.searchParams.set(paramName, "[redacted]")
    }
  })

  return safeUrl.toString()
}

function getCiriumLiveAircraftHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "SkysirvLive/1.0",
  }

  if (env.CIRIUM_SKY_SECRET) {
    headers.Authorization = env.CIRIUM_SKY_SECRET
  }

  return headers
}

function getSkyBaseUrlWithPath(path: string) {
  if (!env.CIRIUM_SKY_BASE_URL) return null

  const url = new URL(env.CIRIUM_SKY_BASE_URL)
  const normalizedPath = url.pathname.replace(/\/$/, "")

  url.pathname =
    !normalizedPath || normalizedPath === "/"
      ? path
      : `${normalizedPath}${path}`

  return url
}

function getCiriumFlightPositionsRadiusUrl(params: {
  latitude: number
  longitude: number
  distanceMiles: number
  maxFlights: number
}) {
  const url = getSkyBaseUrlWithPath(
    `/v1/flights/positions/latitude/${params.latitude}/longitude/${params.longitude}/distance-miles/${params.distanceMiles}`,
  )

  if (!url) return null

  url.searchParams.set("maxFlights", String(params.maxFlights))
  url.searchParams.set("sourceType", "derived")

  return url
}

function getCiriumFlightPositionsBoundingBoxUrl(params: {
  topLatitude: number
  leftLongitude: number
  bottomLatitude: number
  rightLongitude: number
  maxFlights: number
}) {
  const url = getSkyBaseUrlWithPath(
    `/v1/flights/positions/top-latitude/${params.topLatitude}/left-longitude/${params.leftLongitude}/bottom-latitude/${params.bottomLatitude}/right-longitude/${params.rightLongitude}`,
  )

  if (!url) return null

  url.searchParams.set("maxFlights", String(params.maxFlights))
  url.searchParams.set("sourceType", "derived")

  return url
}

function getCiriumFlightTrackUrl(params: {
  flightId: string
  maxPositions: number
}) {
  const url = getSkyBaseUrlWithPath(`/v1/flights/track/${params.flightId}`)

  if (!url) return null

  url.searchParams.set("sourceType", "derived")
  url.searchParams.set("maxPositions", String(params.maxPositions))

  return url
}

async function fetchCiriumJson<T>(url: URL): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    CIRIUM_LIVE_AIRCRAFT_REQUEST_TIMEOUT_MS,
  )

  const requestUrl = getSafeCiriumRequestUrl(url)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getCiriumLiveAircraftHeaders(),
      signal: controller.signal,
    })

    if (!response.ok) {
      let errorBody: CiriumErrorResponse | null = null

      try {
        errorBody = (await response.json()) as CiriumErrorResponse
      } catch {
        errorBody = null
      }

      throw new CiriumLiveAircraftApiError({
        statusCode: response.status,
        statusText: response.statusText,
        code: errorBody?.error?.code ?? null,
        providerMessage: errorBody?.error?.message ?? null,
        requestUrl,
      })
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof CiriumLiveAircraftApiError) {
      throw error
    }

    throw new CiriumLiveAircraftApiError({
      statusCode: 502,
      statusText: "Cirium request failed",
      code: null,
      providerMessage:
        error instanceof Error ? error.message : "Cirium request failed",
      requestUrl,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export function canUseCiriumLiveAircraft() {
  return (
    env.CIRIUM_ENABLED &&
    env.CIRIUM_LIVE_AIRCRAFT_ENABLED &&
    env.CIRIUM_API_MODE === "sky" &&
    !!env.CIRIUM_SKY_IDENTIFIER &&
    !!env.CIRIUM_SKY_SECRET &&
    !!env.CIRIUM_SKY_BASE_URL
  )
}

function getDistanceKilometers(params: {
  latitudeA: number
  longitudeA: number
  latitudeB: number
  longitudeB: number
}) {
  const earthRadiusKilometers = 6371
  const latARadians = (params.latitudeA * Math.PI) / 180
  const latBRadians = (params.latitudeB * Math.PI) / 180
  const deltaLatRadians = ((params.latitudeB - params.latitudeA) * Math.PI) / 180
  const deltaLonRadians =
    ((params.longitudeB - params.longitudeA) * Math.PI) / 180

  const haversine =
    Math.sin(deltaLatRadians / 2) * Math.sin(deltaLatRadians / 2) +
    Math.cos(latARadians) *
    Math.cos(latBRadians) *
    Math.sin(deltaLonRadians / 2) *
    Math.sin(deltaLonRadians / 2)

  return (
    earthRadiusKilometers *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function getRouteProgressPercent(params: {
  currentLatitude: number
  currentLongitude: number
  originLatitude: number | null
  originLongitude: number | null
  destinationLatitude: number | null
  destinationLongitude: number | null
}) {
  if (
    params.originLatitude === null ||
    params.originLongitude === null ||
    params.destinationLatitude === null ||
    params.destinationLongitude === null
  ) {
    return null
  }

  const totalDistance = getDistanceKilometers({
    latitudeA: params.originLatitude,
    longitudeA: params.originLongitude,
    latitudeB: params.destinationLatitude,
    longitudeB: params.destinationLongitude,
  })

  if (totalDistance <= 0) return null

  const traveledDistance = getDistanceKilometers({
    latitudeA: params.originLatitude,
    longitudeA: params.originLongitude,
    latitudeB: params.currentLatitude,
    longitudeB: params.currentLongitude,
  })

  return Math.max(
    0,
    Math.min(100, Math.round((traveledDistance / totalDistance) * 100)),
  )
}

function hasRequiredTrackDetails(details: SkysirvLiveAircraftTrackDetails) {
  return (
    !!details.airlineName &&
    !!details.aircraftType &&
    !!details.originCode &&
    !!details.originCity &&
    !!details.destinationCode &&
    !!details.destinationCity
  )
}

function isPassengerAircraft(aircraft: SkysirvLiveAircraftWithTrackDetails) {
  const carrierCode = aircraft.carrierFsCode?.toUpperCase()

  if (carrierCode && NON_PASSENGER_CARRIER_CODES.has(carrierCode)) {
    return false
  }

  const airlineName = aircraft.airlineName.toLowerCase()

  return !NON_PASSENGER_AIRLINE_NAME_PARTS.some((namePart) =>
    airlineName.includes(namePart),
  )
}

function mergePositionWithTrackDetails(params: {
  position: SkysirvLiveAircraft
  details: SkysirvLiveAircraftTrackDetails
}): SkysirvLiveAircraftWithTrackDetails | null {
  const { position, details } = params

  if (!hasRequiredTrackDetails(details)) return null

  return {
    ...position,
    id: details.flightId,
    flightId: details.flightId,
    callsign: details.callsign,
    flightNumber: details.flightNumber,
    tailNumber: details.tailNumber ?? position.tailNumber,
    heading: details.heading ?? position.heading,
    carrierFsCode: details.carrierFsCode,
    airlineName: details.airlineName!,
    aircraftType: details.aircraftType!,
    equipmentCode: details.equipmentCode,
    originCode: details.originCode!,
    originName: details.originName,
    originCity: details.originCity!,
    originCountry: details.originCountry,
    destinationCode: details.destinationCode!,
    destinationName: details.destinationName,
    destinationCity: details.destinationCity!,
    destinationCountry: details.destinationCountry,
    departureDateUtc: details.departureDateUtc,
    departureDateLocal: details.departureDateLocal,
    delayMinutes: details.delayMinutes ?? 0,
    routeProgressPercent: getRouteProgressPercent({
      currentLatitude: position.latitude,
      currentLongitude: position.longitude,
      originLatitude: details.originLatitude,
      originLongitude: details.originLongitude,
      destinationLatitude: details.destinationLatitude,
      destinationLongitude: details.destinationLongitude,
    }),
  }
}

function normalizeBoundingBox(params: SkysirvLiveAircraftBoundingBox) {
  return {
    topLatitude: clampLatitude(
      Math.max(params.topLatitude, params.bottomLatitude),
    ),
    bottomLatitude: clampLatitude(
      Math.min(params.topLatitude, params.bottomLatitude),
    ),
    leftLongitude: clampLongitude(
      Math.min(params.leftLongitude, params.rightLongitude),
    ),
    rightLongitude: clampLongitude(
      Math.max(params.leftLongitude, params.rightLongitude),
    ),
  }
}

function getBoundingBoxTiles(params: SkysirvLiveAircraftBoundingBox & {
  maxTiles: number
}) {
  const bounds = normalizeBoundingBox(params)
  const tiles: SkysirvLiveAircraftBoundingBox[] = []

  for (
    let bottom = bounds.bottomLatitude;
    bottom < bounds.topLatitude;
    bottom += CIRIUM_BOUNDING_BOX_MAX_DEGREES
  ) {
    const tileTop = Math.min(
      bottom + CIRIUM_BOUNDING_BOX_MAX_DEGREES,
      bounds.topLatitude,
    )

    for (
      let left = bounds.leftLongitude;
      left < bounds.rightLongitude;
      left += CIRIUM_BOUNDING_BOX_MAX_DEGREES
    ) {
      const tileRight = Math.min(
        left + CIRIUM_BOUNDING_BOX_MAX_DEGREES,
        bounds.rightLongitude,
      )

      if (tileTop <= bottom || tileRight <= left) continue

      tiles.push({
        topLatitude: Number(tileTop.toFixed(4)),
        leftLongitude: Number(left.toFixed(4)),
        bottomLatitude: Number(bottom.toFixed(4)),
        rightLongitude: Number(tileRight.toFixed(4)),
      })
    }
  }

  if (tiles.length <= params.maxTiles) return tiles

  const distributedTiles = new Map<number, SkysirvLiveAircraftBoundingBox>()

  for (let index = 0; index < params.maxTiles; index += 1) {
    const tileIndex = Math.floor((index * tiles.length) / params.maxTiles)
    const tile = tiles[tileIndex]

    if (tile) {
      distributedTiles.set(tileIndex, tile)
    }
  }

  return Array.from(distributedTiles.values())
}

function getDistributedItems<T>(items: T[], maxItems: number) {
  if (items.length <= maxItems) return items

  const distributedItems = new Map<number, T>()

  for (let index = 0; index < maxItems; index += 1) {
    const itemIndex = Math.floor((index * items.length) / maxItems)
    const item = items[itemIndex]

    if (item) {
      distributedItems.set(itemIndex, item)
    }
  }

  return Array.from(distributedItems.values())
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1

      results[currentIndex] = await handler(items[currentIndex])
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )

  await Promise.all(workers)

  return results
}

async function getCiriumLiveAircraftPositionsForBoundingBoxTile(params: {
  tile: SkysirvLiveAircraftBoundingBox
  maxFlights: number
}) {
  const url = getCiriumFlightPositionsBoundingBoxUrl({
    ...params.tile,
    maxFlights: params.maxFlights,
  })

  if (!url) return []

  const data = await fetchCiriumJson<CiriumFlightPositionResponse>(url)

  if (!Array.isArray(data.flightPositions)) return []

  return data.flightPositions
    .map((flightPosition) => normalizeCiriumFlightPosition(flightPosition))
    .filter((aircraft): aircraft is SkysirvLiveAircraft => aircraft !== null)
}

export async function getCiriumLiveAircraftPositions(params: {
  latitude: number
  longitude: number
  distanceMiles?: number
  maxFlights?: number
}) {
  if (!canUseCiriumLiveAircraft()) return []

  const distanceMiles = Math.max(1, Math.min(params.distanceMiles ?? 50, 250))
  const maxFlights = Math.max(1, Math.min(params.maxFlights ?? 25, 50))

  const url = getCiriumFlightPositionsRadiusUrl({
    latitude: params.latitude,
    longitude: params.longitude,
    distanceMiles,
    maxFlights,
  })

  if (!url) return []

  const data = await fetchCiriumJson<CiriumFlightPositionResponse>(url)

  if (!Array.isArray(data.flightPositions)) return []

  return data.flightPositions
    .map((flightPosition) => normalizeCiriumFlightPosition(flightPosition))
    .filter((aircraft): aircraft is SkysirvLiveAircraft => aircraft !== null)
}

export async function getCiriumLiveAircraftTrackDetails(params: {
  flightId: string
  maxPositions?: number
}) {
  if (!canUseCiriumLiveAircraft()) return null

  const flightId = params.flightId.trim()

  if (!flightId) return null

  const cachedTrack = aircraftTrackCache.get(flightId)

  if (cachedTrack && cachedTrack.expiresAt > Date.now()) {
    return cachedTrack.data
  }

  const maxPositions = Math.max(1, Math.min(params.maxPositions ?? 25, 100))

  const url = getCiriumFlightTrackUrl({
    flightId,
    maxPositions,
  })

  if (!url) return null

  const data = await fetchCiriumJson<CiriumFlightTrackResponse>(url)
  const normalizedTrack = normalizeCiriumFlightTrack(data)

  if (normalizedTrack) {
    aircraftTrackCache.set(flightId, {
      expiresAt: Date.now() + CIRIUM_AIRCRAFT_TRACK_CACHE_TTL_MS,
      data: normalizedTrack,
    })
  }

  return normalizedTrack
}

export async function getCiriumLiveAircraftPositionsWithTrackDetails(params: {
  latitude: number
  longitude: number
  distanceMiles?: number
  maxFlights?: number
}) {
  const positions = await getCiriumLiveAircraftPositions(params)

  const enrichedAircraft = await mapWithConcurrency(
    positions,
    TRACK_ENRICHMENT_CONCURRENCY,
    async (position) => {
      try {
        const details = await getCiriumLiveAircraftTrackDetails({
          flightId: position.flightId,
          maxPositions: 25,
        })

        if (!details) return null

        return mergePositionWithTrackDetails({
          position,
          details,
        })
      } catch (error) {
        if (shouldRethrowCiriumLiveAircraftError(error)) {
          throw error
        }

        return null
      }
    },
  )

  return enrichedAircraft
    .filter(
      (
        aircraft,
      ): aircraft is SkysirvLiveAircraftWithTrackDetails => aircraft !== null,
    )
    .filter(isPassengerAircraft)
}

async function getCiriumLiveAircraftForTiles(params: {
  tiles: SkysirvLiveAircraftBoundingBox[]
  maxAircraft: number
  maxFlightsPerTile: number
}) {
  const aircraftGroups = await mapWithConcurrency(
    params.tiles,
    6,
    async (tile) => {
      try {
        return await getCiriumLiveAircraftPositionsForBoundingBoxTile({
          tile,
          maxFlights: params.maxFlightsPerTile,
        })
      } catch (error) {
        if (shouldRethrowCiriumLiveAircraftError(error)) {
          throw error
        }

        return []
      }
    },
  )

  const aircraftByFlightId = new Map<string, SkysirvLiveAircraft>()

  for (const aircraft of aircraftGroups.flat()) {
    aircraftByFlightId.set(aircraft.flightId, aircraft)
  }

  return getDistributedItems(
    Array.from(aircraftByFlightId.values()),
    params.maxAircraft,
  )
}

async function getCiriumLiveAircraftForTilesWithTrackDetails(params: {
  tiles: SkysirvLiveAircraftBoundingBox[]
  maxAircraft: number
  maxFlightsPerTile: number
}) {
  const aircraftGroups = await mapWithConcurrency(
    params.tiles,
    6,
    async (tile) => {
      try {
        return await getCiriumLiveAircraftPositionsForBoundingBoxTile({
          tile,
          maxFlights: params.maxFlightsPerTile,
        })
      } catch (error) {
        if (shouldRethrowCiriumLiveAircraftError(error)) {
          throw error
        }

        return []
      }
    },
  )

  const aircraftByFlightId = new Map<string, SkysirvLiveAircraft>()

  for (const aircraft of aircraftGroups.flat()) {
    aircraftByFlightId.set(aircraft.flightId, aircraft)
  }

  const aircraftCandidates = getDistributedItems(
    Array.from(aircraftByFlightId.values()),
    Math.min(params.maxAircraft * 3, 45),
  )

  const enrichedAircraft = await mapWithConcurrency(
    aircraftCandidates,
    TRACK_ENRICHMENT_CONCURRENCY,
    async (position) => {
      try {
        const details = await getCiriumLiveAircraftTrackDetails({
          flightId: position.flightId,
          maxPositions: 25,
        })

        if (!details) return null

        return mergePositionWithTrackDetails({
          position,
          details,
        })
      } catch (error) {
        if (shouldRethrowCiriumLiveAircraftError(error)) {
          throw error
        }

        return null
      }
    },
  )

  return enrichedAircraft
    .filter(
      (
        aircraft,
      ): aircraft is SkysirvLiveAircraftWithTrackDetails => aircraft !== null,
    )
    .filter(isPassengerAircraft)
    .slice(0, params.maxAircraft)
}

export async function getCiriumLiveAircraftBoundingBoxPositionsWithTrackDetails(
  params: SkysirvLiveAircraftBoundingBox & {
    maxAircraft?: number
    maxTiles?: number
    maxFlightsPerTile?: number
  },
) {
  if (!canUseCiriumLiveAircraft()) return []

  const maxAircraft = Math.max(
    1,
    Math.min(params.maxAircraft ?? DEFAULT_MAX_AIRCRAFT, 80),
  )
  const maxTiles = Math.max(
    1,
    Math.min(params.maxTiles ?? DEFAULT_MAX_TILES, 40),
  )
  const maxFlightsPerTile = Math.max(
    1,
    Math.min(params.maxFlightsPerTile ?? DEFAULT_MAX_FLIGHTS_PER_TILE, 10),
  )

  const tiles = getBoundingBoxTiles({
    topLatitude: params.topLatitude,
    leftLongitude: params.leftLongitude,
    bottomLatitude: params.bottomLatitude,
    rightLongitude: params.rightLongitude,
    maxTiles,
  })

  return getCiriumLiveAircraftForTilesWithTrackDetails({
    tiles,
    maxAircraft,
    maxFlightsPerTile,
  })
}

export async function getCiriumLiveAircraftRegionPositions(params: {
  regionKey: string
  maxAircraft?: number
}) {
  if (!canUseCiriumLiveAircraft()) return []

  const regionKey = params.regionKey
    .trim()
    .toLowerCase() as SkysirvLiveAircraftRegionKey

  const maxAircraft = Math.max(
    1,
    Math.min(params.maxAircraft ?? DEFAULT_MAX_AIRCRAFT, 80),
  )

  const focusBounds = LIVE_AIRCRAFT_REGION_FOCUS_BOUNDS[regionKey]

  if (focusBounds && focusBounds.length > 0) {
    return getCiriumLiveAircraftForTiles({
      tiles: focusBounds,
      maxAircraft,
      maxFlightsPerTile: DEFAULT_MAX_FLIGHTS_PER_TILE,
    })
  }

  const bounds =
    LIVE_AIRCRAFT_REGION_BOUNDS[regionKey] ??
    LIVE_AIRCRAFT_REGION_BOUNDS["north-america"]

  const tiles = getBoundingBoxTiles({
    ...bounds,
    maxTiles: DEFAULT_MAX_TILES,
  })

  return getCiriumLiveAircraftForTiles({
    tiles,
    maxAircraft,
    maxFlightsPerTile: DEFAULT_MAX_FLIGHTS_PER_TILE,
  })
}

export async function getCiriumLiveAircraftRegionPositionsWithTrackDetails(params: {
  regionKey: string
  maxAircraft?: number
}) {
  if (!canUseCiriumLiveAircraft()) return []

  const regionKey = params.regionKey
    .trim()
    .toLowerCase() as SkysirvLiveAircraftRegionKey

  const maxAircraft = Math.max(
    1,
    Math.min(params.maxAircraft ?? DEFAULT_MAX_AIRCRAFT, 80),
  )

  const focusBounds = LIVE_AIRCRAFT_REGION_FOCUS_BOUNDS[regionKey]

  if (focusBounds && focusBounds.length > 0) {
    return getCiriumLiveAircraftForTilesWithTrackDetails({
      tiles: focusBounds,
      maxAircraft,
      maxFlightsPerTile: DEFAULT_MAX_FLIGHTS_PER_TILE,
    })
  }

  const bounds =
    LIVE_AIRCRAFT_REGION_BOUNDS[regionKey] ??
    LIVE_AIRCRAFT_REGION_BOUNDS["north-america"]

  return getCiriumLiveAircraftBoundingBoxPositionsWithTrackDetails({
    ...bounds,
    maxAircraft,
    maxTiles: DEFAULT_MAX_TILES,
    maxFlightsPerTile: DEFAULT_MAX_FLIGHTS_PER_TILE,
  })
}