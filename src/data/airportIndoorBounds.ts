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
  ATL: {
    code: "ATL",
    name: "Hartsfield-Jackson Atlanta International Airport",
    center: {
      latitude: 33.6407,
      longitude: -84.4277,
    },
    bounds: {
      north: 33.6535,
      south: 33.635,
      east: -84.414,
      west: -84.463,
    },
    grid: {
      rows: 11,
      columns: 15,
    },
  },

  BOS: {
    code: "BOS",
    name: "Boston Logan International Airport",
    center: {
      latitude: 42.3656,
      longitude: -71.0096,
    },
    bounds: {
      north: 42.372,
      south: 42.358,
      east: -70.998,
      west: -71.03,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  CLT: {
    code: "CLT",
    name: "Charlotte Douglas International Airport",
    center: {
      latitude: 35.214,
      longitude: -80.9431,
    },
    bounds: {
      north: 35.225,
      south: 35.209,
      east: -80.931,
      west: -80.955,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  DCA: {
    code: "DCA",
    name: "Ronald Reagan Washington National Airport",
    center: {
      latitude: 38.8521,
      longitude: -77.0377,
    },
    bounds: {
      north: 38.859,
      south: 38.846,
      east: -77.035,
      west: -77.05,
    },
    grid: {
      rows: 9,
      columns: 11,
    },
  },

  DEN: {
    code: "DEN",
    name: "Denver International Airport",
    center: {
      latitude: 39.8561,
      longitude: -104.6737,
    },
    bounds: {
      north: 39.868,
      south: 39.838,
      east: -104.66,
      west: -104.692,
    },
    grid: {
      rows: 13,
      columns: 13,
    },
  },

  DFW: {
    code: "DFW",
    name: "Dallas Fort Worth International Airport",
    center: {
      latitude: 32.8998,
      longitude: -97.0403,
    },
    bounds: {
      north: 32.916,
      south: 32.886,
      east: -97.021,
      west: -97.055,
    },
    grid: {
      rows: 13,
      columns: 13,
    },
  },

  EWR: {
    code: "EWR",
    name: "Newark Liberty International Airport",
    center: {
      latitude: 40.6925,
      longitude: -74.177,
    },
    bounds: {
      north: 40.7015,
      south: 40.684,
      east: -74.166,
      west: -74.195,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  FLL: {
    code: "FLL",
    name: "Fort Lauderdale-Hollywood International Airport",
    center: {
      latitude: 26.0726,
      longitude: -80.1527,
    },
    bounds: {
      north: 26.078,
      south: 26.066,
      east: -80.145,
      west: -80.161,
    },
    grid: {
      rows: 9,
      columns: 11,
    },
  },

  IAD: {
    code: "IAD",
    name: "Washington Dulles International Airport",
    center: {
      latitude: 38.9531,
      longitude: -77.4565,
    },
    bounds: {
      north: 38.965,
      south: 38.941,
      east: -77.438,
      west: -77.473,
    },
    grid: {
      rows: 13,
      columns: 13,
    },
  },

  IAH: {
    code: "IAH",
    name: "George Bush Intercontinental Airport",
    center: {
      latitude: 29.9844,
      longitude: -95.3414,
    },
    bounds: {
      north: 29.994,
      south: 29.976,
      east: -95.329,
      west: -95.354,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  JFK: {
    code: "JFK",
    name: "John F. Kennedy International Airport",
    center: {
      latitude: 40.6413,
      longitude: -73.7781,
    },
    bounds: {
      north: 40.653,
      south: 40.635,
      east: -73.769,
      west: -73.795,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  LAS: {
    code: "LAS",
    name: "Harry Reid International Airport",
    center: {
      latitude: 36.084,
      longitude: -115.1537,
    },
    bounds: {
      north: 36.093,
      south: 36.076,
      east: -115.143,
      west: -115.165,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  LAX: {
    code: "LAX",
    name: "Los Angeles International Airport",
    center: {
      latitude: 33.9416,
      longitude: -118.4085,
    },
    bounds: {
      north: 33.949,
      south: 33.938,
      east: -118.397,
      west: -118.418,
    },
    grid: {
      rows: 9,
      columns: 13,
    },
  },

  LGA: {
    code: "LGA",
    name: "LaGuardia Airport",
    center: {
      latitude: 40.7769,
      longitude: -73.874,
    },
    bounds: {
      north: 40.783,
      south: 40.769,
      east: -73.86,
      west: -73.889,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  MCO: {
    code: "MCO",
    name: "Orlando International Airport",
    center: {
      latitude: 28.4312,
      longitude: -81.3081,
    },
    bounds: {
      north: 28.441,
      south: 28.421,
      east: -81.294,
      west: -81.322,
    },
    grid: {
      rows: 13,
      columns: 13,
    },
  },

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

  ORD: {
    code: "ORD",
    name: "Chicago O'Hare International Airport",
    center: {
      latitude: 41.9742,
      longitude: -87.9073,
    },
    bounds: {
      north: 41.984,
      south: 41.967,
      east: -87.895,
      west: -87.922,
    },
    grid: {
      rows: 13,
      columns: 13,
    },
  },

  PHL: {
    code: "PHL",
    name: "Philadelphia International Airport",
    center: {
      latitude: 39.8744,
      longitude: -75.2424,
    },
    bounds: {
      north: 39.883,
      south: 39.869,
      east: -75.232,
      west: -75.256,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  PHX: {
    code: "PHX",
    name: "Phoenix Sky Harbor International Airport",
    center: {
      latitude: 33.4352,
      longitude: -112.0101,
    },
    bounds: {
      north: 33.443,
      south: 33.429,
      east: -112,
      west: -112.023,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  SEA: {
    code: "SEA",
    name: "Seattle-Tacoma International Airport",
    center: {
      latitude: 47.4502,
      longitude: -122.3088,
    },
    bounds: {
      north: 47.458,
      south: 47.442,
      east: -122.296,
      west: -122.32,
    },
    grid: {
      rows: 11,
      columns: 13,
    },
  },

  SFO: {
    code: "SFO",
    name: "San Francisco International Airport",
    center: {
      latitude: 37.6213,
      longitude: -122.379,
    },
    bounds: {
      north: 37.63,
      south: 37.612,
      east: -122.371,
      west: -122.395,
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

export function getSupportedAirportIndoorBounds() {
  return Object.values(AIRPORT_INDOOR_BOUNDS).sort((a, b) =>
    a.code.localeCompare(b.code)
  )
}