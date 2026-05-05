export type AirportIndoorBounds = {
  code: string
  name: string
  center: {
    latitude: number
    longitude: number
  }
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
  grid: {
    rows: number
    columns: number
  }
}

export const AIRPORT_INDOOR_BOUNDS: Record<string, AirportIndoorBounds> = {
  MIA: {
    code: "MIA",
    name: "Miami International Airport",
    center: {
      latitude: 25.7959,
      longitude: -80.287,
    },
    bounds: {
      north: 25.8025,
      south: 25.7885,
      east: -80.268,
      west: -80.304,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },
}

export function getAirportIndoorBounds(code: string) {
  return AIRPORT_INDOOR_BOUNDS[code.trim().toUpperCase()] ?? null
}