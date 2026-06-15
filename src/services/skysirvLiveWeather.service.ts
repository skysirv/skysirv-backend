export type SkysirvLiveWeatherRisk = "normal" | "minor" | "moderate" | "major"

export type SkysirvLiveWeatherSnapshot = {
  source: "Open-Meteo"
  observedAt: string
  latitude: number
  longitude: number
  temperatureC: number | null
  feelsLikeC: number | null
  humidityPercent: number | null
  precipitationMm: number | null
  cloudCoverPercent: number | null
  pressureHpa: number | null
  windSpeedKmh: number | null
  windGustKmh: number | null
  windDirectionDegrees: number | null
  weatherCode: number | null
  weatherSummary: string
  aviationRisk: SkysirvLiveWeatherRisk
  riskReason: string | null
}

type OpenMeteoCurrentWeather = {
  time?: string
  temperature_2m?: number
  relative_humidity_2m?: number
  apparent_temperature?: number
  precipitation?: number
  cloud_cover?: number
  pressure_msl?: number
  wind_speed_10m?: number
  wind_direction_10m?: number
  wind_gusts_10m?: number
  weather_code?: number
}

type OpenMeteoResponse = {
  latitude?: number
  longitude?: number
  current?: OpenMeteoCurrentWeather
}

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

const CACHE_TTL_MS = 10 * 60_000

const weatherCache = new Map<
  string,
  {
    cachedAt: number
    data: SkysirvLiveWeatherSnapshot
  }
>()

function weatherCodeToSummary(code: number | null): string {
  if (code === null) return "Weather data unavailable"

  if (code === 0) return "Clear"
  if ([1, 2].includes(code)) return "Partly cloudy"
  if (code === 3) return "Overcast"
  if ([45, 48].includes(code)) return "Fog"
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle"
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain"
  if ([71, 73, 75, 77].includes(code)) return "Snow"
  if ([80, 81, 82].includes(code)) return "Rain showers"
  if ([85, 86].includes(code)) return "Snow showers"
  if ([95, 96, 99].includes(code)) return "Thunderstorms"

  return "Weather conditions active"
}

function computeAviationWeatherRisk(input: {
  weatherCode: number | null
  precipitationMm: number | null
  windSpeedKmh: number | null
  windGustKmh: number | null
  cloudCoverPercent: number | null
}): {
  aviationRisk: SkysirvLiveWeatherRisk
  riskReason: string | null
} {
  const reasons: string[] = []

  let score = 0

  if (input.weatherCode !== null) {
    if ([95, 96, 99].includes(input.weatherCode)) {
      score += 4
      reasons.push("thunderstorms")
    } else if ([45, 48].includes(input.weatherCode)) {
      score += 3
      reasons.push("fog")
    } else if (
      [61, 63, 65, 66, 67, 80, 81, 82, 71, 73, 75, 77, 85, 86].includes(
        input.weatherCode,
      )
    ) {
      score += 2
      reasons.push("precipitation")
    } else if ([51, 53, 55, 56, 57].includes(input.weatherCode)) {
      score += 1
      reasons.push("drizzle")
    }
  }

  if (input.windGustKmh !== null) {
    if (input.windGustKmh >= 70) {
      score += 4
      reasons.push("strong wind gusts")
    } else if (input.windGustKmh >= 50) {
      score += 2
      reasons.push("elevated wind gusts")
    }
  }

  if (input.windSpeedKmh !== null) {
    if (input.windSpeedKmh >= 45) {
      score += 2
      reasons.push("strong surface winds")
    } else if (input.windSpeedKmh >= 30) {
      score += 1
      reasons.push("elevated surface winds")
    }
  }

  if (input.precipitationMm !== null) {
    if (input.precipitationMm >= 8) {
      score += 3
      reasons.push("heavy precipitation")
    } else if (input.precipitationMm >= 2) {
      score += 1
      reasons.push("active precipitation")
    }
  }

  if (input.cloudCoverPercent !== null && input.cloudCoverPercent >= 90) {
    score += 1
    reasons.push("low visual weather margin")
  }

  if (score >= 6) {
    return {
      aviationRisk: "major",
      riskReason: reasons.join(", ") || null,
    }
  }

  if (score >= 4) {
    return {
      aviationRisk: "moderate",
      riskReason: reasons.join(", ") || null,
    }
  }

  if (score >= 1) {
    return {
      aviationRisk: "minor",
      riskReason: reasons.join(", ") || null,
    }
  }

  return {
    aviationRisk: "normal",
    riskReason: null,
  }
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}

export async function getSkysirvLiveWeatherForCoordinates(params: {
  latitude: number
  longitude: number
}): Promise<SkysirvLiveWeatherSnapshot> {
  const cacheKey = getCacheKey(params.latitude, params.longitude)
  const now = Date.now()
  const cached = weatherCache.get(cacheKey)

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data
  }

  const url = new URL(OPEN_METEO_FORECAST_URL)

  url.searchParams.set("latitude", String(params.latitude))
  url.searchParams.set("longitude", String(params.longitude))
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "weather_code",
    ].join(","),
  )
  url.searchParams.set("temperature_unit", "celsius")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("precipitation_unit", "mm")
  url.searchParams.set("timezone", "UTC")

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkysirvLive/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(
      `Open-Meteo weather request failed with ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as OpenMeteoResponse
  const current = data.current ?? {}

  const weatherCode = toNumberOrNull(current.weather_code)
  const precipitationMm = toNumberOrNull(current.precipitation)
  const cloudCoverPercent = toNumberOrNull(current.cloud_cover)
  const windSpeedKmh = toNumberOrNull(current.wind_speed_10m)
  const windGustKmh = toNumberOrNull(current.wind_gusts_10m)

  const weatherRisk = computeAviationWeatherRisk({
    weatherCode,
    precipitationMm,
    windSpeedKmh,
    windGustKmh,
    cloudCoverPercent,
  })

  const snapshot: SkysirvLiveWeatherSnapshot = {
    source: "Open-Meteo",
    observedAt: current.time
      ? new Date(`${current.time}Z`).toISOString()
      : new Date().toISOString(),
    latitude: data.latitude ?? params.latitude,
    longitude: data.longitude ?? params.longitude,
    temperatureC: toNumberOrNull(current.temperature_2m),
    feelsLikeC: toNumberOrNull(current.apparent_temperature),
    humidityPercent: toNumberOrNull(current.relative_humidity_2m),
    precipitationMm,
    cloudCoverPercent,
    pressureHpa: toNumberOrNull(current.pressure_msl),
    windSpeedKmh,
    windGustKmh,
    windDirectionDegrees: toNumberOrNull(current.wind_direction_10m),
    weatherCode,
    weatherSummary: weatherCodeToSummary(weatherCode),
    aviationRisk: weatherRisk.aviationRisk,
    riskReason: weatherRisk.riskReason,
  }

  weatherCache.set(cacheKey, {
    cachedAt: now,
    data: snapshot,
  })

  return snapshot
}