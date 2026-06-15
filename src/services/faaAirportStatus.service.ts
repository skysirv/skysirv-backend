import { XMLParser } from "fast-xml-parser"

export type SkysirvLiveAirportSeverity = "normal" | "minor" | "moderate" | "major"

export type NormalizedFaaAirportStatus = {
  iata: string
  severity: SkysirvLiveAirportSeverity
  statusLabel: string
  departuresDelay: number | null
  arrivalsDelay: number | null
  groundStopActive: boolean
  groundDelayActive: boolean
  airportClosureActive: boolean
  disruptionReason: string | null
  eventType: string
  source: "FAA"
  observedAt: string
}

export type FaaAirportStatusResponse = {
  source: "FAA"
  observedAt: string
  airports: NormalizedFaaAirportStatus[]
}

const FAA_AIRPORT_STATUS_URL =
  "https://nasstatus.faa.gov/api/airport-status-information"

const CACHE_TTL_MS = 60_000

let cachedStatus:
  | {
    cachedAt: number
    data: FaaAirportStatusResponse
  }
  | null = null

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: true,
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toArray(value: unknown): unknown[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }

    if (typeof value === "number") {
      return String(value)
    }
  }

  return null
}

function parseDelayMinutes(value: string | number | null): number | null {
  if (value === null) return null

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    return Math.max(0, Math.round(value))
  }

  const match = value.match(/\d+/)
  if (!match) return null

  const minutes = Number(match[0])
  return Number.isFinite(minutes) ? minutes : null
}

function isNonCommercialClosureNotice(reason: string | null): boolean {
  if (!reason) return false

  const normalizedReason = reason.toUpperCase()

  return (
    normalizedReason.includes("NON SKED TRANSIENT GA") ||
    normalizedReason.includes("NON-SKED TRANSIENT GA") ||
    (normalizedReason.includes("TRANSIENT GA") &&
      normalizedReason.includes("PPR"))
  )
}

function severityFromDelay(minutes: number | null): SkysirvLiveAirportSeverity {
  if (minutes === null || minutes <= 0) return "normal"
  if (minutes >= 60) return "major"
  if (minutes >= 30) return "moderate"
  return "minor"
}

function maxSeverity(
  current: SkysirvLiveAirportSeverity,
  next: SkysirvLiveAirportSeverity,
): SkysirvLiveAirportSeverity {
  const rank: Record<SkysirvLiveAirportSeverity, number> = {
    normal: 0,
    minor: 1,
    moderate: 2,
    major: 3,
  }

  return rank[next] > rank[current] ? next : current
}

function getEventTypeFromPath(path: string[]): string {
  const joined = path.join(" ").toLowerCase()

  if (joined.includes("ground_stop")) return "ground_stop"
  if (joined.includes("ground stop")) return "ground_stop"
  if (joined.includes("ground_delay")) return "ground_delay"
  if (joined.includes("ground delay")) return "ground_delay"
  if (joined.includes("arrival")) return "arrival_delay"
  if (joined.includes("departure")) return "departure_delay"
  if (joined.includes("closure")) return "airport_closure"

  return "airport_event"
}

function statusLabelFromEvent(eventType: string, severity: SkysirvLiveAirportSeverity) {
  if (eventType === "ground_stop") return "Ground stop active"
  if (eventType === "ground_delay") return "Ground delay active"
  if (eventType === "airport_closure") return "Airport closure active"
  if (eventType === "arrival_delay") return "Arrival delays active"
  if (eventType === "departure_delay") return "Departure delays active"

  if (severity === "major") return "Major airport disruption"
  if (severity === "moderate") return "Moderate airport disruption"
  if (severity === "minor") return "Minor airport disruption"

  return "Normal operations"
}

function normalizeFaaAirportEvent(
  record: Record<string, unknown>,
  path: string[],
  observedAt: string,
): NormalizedFaaAirportStatus | null {
  const iata = readString(record, [
    "ARPT",
    "Airport",
    "airport",
    "airportCode",
    "Airport_Code",
    "code",
  ])?.toUpperCase()

  if (!iata || iata.length < 3 || iata.length > 4) {
    return null
  }

  const eventType = getEventTypeFromPath(path)

  const reason = readString(record, [
    "Reason",
    "reason",
    "CAUSE",
    "Cause",
    "reasonText",
    "Reason_Text",
  ])

  if (eventType === "airport_closure" && isNonCommercialClosureNotice(reason)) {
    return null
  }

  const averageDelay = parseDelayMinutes(
    readString(record, [
      "Average_Delay",
      "AVG",
      "Avg",
      "averageDelay",
      "Average",
      "Delay",
      "delay",
    ]),
  )

  const maxDelay = parseDelayMinutes(
    readString(record, ["Max_Delay", "MAX", "maxDelay", "Maximum_Delay"]),
  )

  const effectiveDelay = maxDelay ?? averageDelay

  let severity = severityFromDelay(effectiveDelay)

  if (eventType === "ground_stop" || eventType === "airport_closure") {
    severity = "major"
  }

  if (eventType === "ground_delay" && severity === "normal") {
    severity = "moderate"
  }

  if (
    (eventType === "arrival_delay" || eventType === "departure_delay") &&
    severity === "normal" &&
    reason
  ) {
    severity = "minor"
  }

  const isDepartureDelay = eventType === "departure_delay"
  const isArrivalDelay = eventType === "arrival_delay"

  return {
    iata,
    severity,
    statusLabel: statusLabelFromEvent(eventType, severity),
    departuresDelay: isDepartureDelay || eventType === "ground_delay" ? effectiveDelay : null,
    arrivalsDelay: isArrivalDelay ? effectiveDelay : null,
    groundStopActive: eventType === "ground_stop",
    groundDelayActive: eventType === "ground_delay",
    airportClosureActive: eventType === "airport_closure",
    disruptionReason: reason,
    eventType,
    source: "FAA",
    observedAt,
  }
}

function collectAirportEventsFromXml(
  value: unknown,
  path: string[],
  observedAt: string,
  events: NormalizedFaaAirportStatus[],
) {
  const record = asRecord(value)

  if (!record) {
    return
  }

  const normalized = normalizeFaaAirportEvent(record, path, observedAt)

  if (normalized) {
    events.push(normalized)
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    const nextPath = [...path, key]

    for (const item of toArray(nestedValue)) {
      collectAirportEventsFromXml(item, nextPath, observedAt, events)
    }
  }
}

function mergeAirportEvents(
  events: NormalizedFaaAirportStatus[],
): NormalizedFaaAirportStatus[] {
  const byAirport = new Map<string, NormalizedFaaAirportStatus>()

  for (const event of events) {
    const existing = byAirport.get(event.iata)

    if (!existing) {
      byAirport.set(event.iata, event)
      continue
    }

    const severity = maxSeverity(existing.severity, event.severity)

    byAirport.set(event.iata, {
      ...existing,
      severity,
      statusLabel:
        severity === event.severity ? event.statusLabel : existing.statusLabel,
      departuresDelay:
        event.departuresDelay !== null
          ? Math.max(existing.departuresDelay ?? 0, event.departuresDelay)
          : existing.departuresDelay,
      arrivalsDelay:
        event.arrivalsDelay !== null
          ? Math.max(existing.arrivalsDelay ?? 0, event.arrivalsDelay)
          : existing.arrivalsDelay,
      groundStopActive: existing.groundStopActive || event.groundStopActive,
      groundDelayActive: existing.groundDelayActive || event.groundDelayActive,
      airportClosureActive:
        existing.airportClosureActive || event.airportClosureActive,
      disruptionReason:
        existing.disruptionReason && event.disruptionReason
          ? `${existing.disruptionReason}; ${event.disruptionReason}`
          : existing.disruptionReason ?? event.disruptionReason,
      eventType:
        existing.eventType === event.eventType
          ? existing.eventType
          : `${existing.eventType},${event.eventType}`,
    })
  }

  return Array.from(byAirport.values()).sort((a, b) => {
    const rank: Record<SkysirvLiveAirportSeverity, number> = {
      major: 0,
      moderate: 1,
      minor: 2,
      normal: 3,
    }

    return rank[a.severity] - rank[b.severity] || a.iata.localeCompare(b.iata)
  })
}

export async function getFaaAirportStatuses(): Promise<FaaAirportStatusResponse> {
  const now = Date.now()

  if (cachedStatus && now - cachedStatus.cachedAt < CACHE_TTL_MS) {
    return cachedStatus.data
  }

  const response = await fetch(FAA_AIRPORT_STATUS_URL, {
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent": "SkysirvLive/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(
      `FAA airport status request failed with ${response.status} ${response.statusText}`,
    )
  }

  const xml = await response.text()
  const observedAt = new Date().toISOString()
  const parsed = xmlParser.parse(xml)

  const rawEvents: NormalizedFaaAirportStatus[] = []

  collectAirportEventsFromXml(parsed, [], observedAt, rawEvents)

  const data: FaaAirportStatusResponse = {
    source: "FAA",
    observedAt,
    airports: mergeAirportEvents(rawEvents),
  }

  cachedStatus = {
    cachedAt: now,
    data,
  }

  return data
}