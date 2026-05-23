import { FastifyInstance } from "fastify"
import {
  getOpenAIChatModel,
  getOpenAIIntelligenceModel,
  openai,
} from "../services/openai.js"
import { getUserWatchlist } from "../db/watchlist.js"
import { airportDirectory } from "../data/airports.js"

type FlightAttendantRole = "user" | "assistant"

type FlightAttendantIncomingMessage = {
  role?: FlightAttendantRole
  content?: string
  text?: string
}

type FlightAttendantDashboardRouteContext = {
  id?: string
  origin?: string
  destination?: string
  departureDate?: string | null
  routeLabel?: string
  latestPrice?: number | null
  averagePrice?: number | null
  bookingSignal?: string | null
  recommendedFlights?: Array<{
    airline?: string | null
    airlineName?: string | null
    airlineLogoSymbolUrl?: string | null
    airlineLogoLockupUrl?: string | null
    flightNumber?: string | null
    price?: number | null
    currency?: string | null
    stopCount?: number | null
  }>
}

type FlightAttendantChatBody = {
  message?: string
  messages?: FlightAttendantIncomingMessage[]
  tier?: "free" | "pro" | "business"
  dashboardRoutes?: FlightAttendantDashboardRouteContext[]
}

type LucyWatchlistAction = {
  type: "add_watchlist_route"
  status: "needs_confirmation"
  origin: string
  destination: string
  departureDate: string
  routeLabel: string
  confirmationPrompt: string
}

type LucyPreferredAirportsAction = {
  type: "save_preferred_airports"
  status: "needs_confirmation"
  airportCodes: string[]
  airportLabels: string[]
  confirmationPrompt: string
}

type LucyPreferredRouteAction = {
  type: "save_preferred_route"
  status: "needs_confirmation"
  origin: string
  destination: string
  routeLabel: string
  confirmationPrompt: string
}

type LucySaveFirstNameAction = {
  type: "save_first_name"
  status: "needs_confirmation"
  firstName: string
  confirmationPrompt: string
}

type LucySaveVisibleFlightAction = {
  type: "save_visible_flight"
  status: "needs_confirmation"
  origin: string
  destination: string
  departureDate: string | null
  airline: string | null
  airlineName: string | null
  flightNumber: string | null
  price: number | null
  currency: string | null
  flightLabel: string
  confirmationPrompt: string
}

type LucySuggestedAction =
  | LucyWatchlistAction
  | LucyPreferredAirportsAction
  | LucyPreferredRouteAction
  | LucySaveFirstNameAction
  | LucySaveVisibleFlightAction

type LucyStructuredChatResponse = {
  reply: string
  action: LucySuggestedAction | null
}

const MAX_CONVERSATION_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 2500

type LucyDashboardSummary = {
  headline: string
  summary: string
  signalFeed: string[]
  systemReadout: string
  recommendedAction: "watch" | "wait" | "book" | "insufficient_data"
  confidence: "low" | "medium" | "high"
  dataStatus: "pending" | "building" | "ready"
}

const FALLBACK_DASHBOARD_SUMMARY: LucyDashboardSummary = {
  headline: "Lucy is reviewing your route intelligence",
  summary:
    "Your dashboard is connected. As Skysirv collects more fare history across your watched routes, Lucy will be able to explain route movement, pricing pressure, and booking confidence with more precision.",
  signalFeed: [
    "Route monitoring is active for your saved watchlist.",
    "Fare intelligence improves as more price snapshots are collected.",
    "Lucy will avoid making confident booking calls until the data supports it.",
  ],
  systemReadout:
    "Dashboard intelligence is building from your watchlist, saved route activity, and available fare history.",
  recommendedAction: "insufficient_data",
  confidence: "low",
  dataStatus: "building",
}

function cleanDashboardSummary(value: unknown): LucyDashboardSummary {
  if (!value || typeof value !== "object") {
    return FALLBACK_DASHBOARD_SUMMARY
  }

  const input = value as Partial<LucyDashboardSummary>

  const recommendedActions: LucyDashboardSummary["recommendedAction"][] = [
    "watch",
    "wait",
    "book",
    "insufficient_data",
  ]

  const confidenceLevels: LucyDashboardSummary["confidence"][] = [
    "low",
    "medium",
    "high",
  ]

  const dataStatuses: LucyDashboardSummary["dataStatus"][] = [
    "pending",
    "building",
    "ready",
  ]

  return {
    headline:
      typeof input.headline === "string" && input.headline.trim()
        ? input.headline.trim().slice(0, 140)
        : FALLBACK_DASHBOARD_SUMMARY.headline,
    summary:
      typeof input.summary === "string" && input.summary.trim()
        ? input.summary.trim().slice(0, 700)
        : FALLBACK_DASHBOARD_SUMMARY.summary,
    signalFeed: Array.isArray(input.signalFeed)
      ? input.signalFeed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
      : FALLBACK_DASHBOARD_SUMMARY.signalFeed,
    systemReadout:
      typeof input.systemReadout === "string" && input.systemReadout.trim()
        ? input.systemReadout.trim().slice(0, 500)
        : FALLBACK_DASHBOARD_SUMMARY.systemReadout,
    recommendedAction:
      input.recommendedAction &&
        recommendedActions.includes(input.recommendedAction)
        ? input.recommendedAction
        : FALLBACK_DASHBOARD_SUMMARY.recommendedAction,
    confidence:
      input.confidence && confidenceLevels.includes(input.confidence)
        ? input.confidence
        : FALLBACK_DASHBOARD_SUMMARY.confidence,
    dataStatus:
      input.dataStatus && dataStatuses.includes(input.dataStatus)
        ? input.dataStatus
        : FALLBACK_DASHBOARD_SUMMARY.dataStatus,
  }
}

function parseDashboardSummaryJson(rawText: string): LucyDashboardSummary {
  try {
    const parsed = JSON.parse(rawText)
    return cleanDashboardSummary(parsed)
  } catch {
    return FALLBACK_DASHBOARD_SUMMARY
  }
}

function cleanAirportCode(value: unknown) {
  if (typeof value !== "string") return null

  const code = value.trim().toUpperCase()

  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null

  if (!airportDirectory[code]) return null

  return code
}

function cleanDepartureDate(value: unknown) {
  if (typeof value !== "string") return null

  const rawDate = value.trim()

  let year: number | null = null
  let month: number | null = null
  let day: number | null = null

  const isoDateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const usDateMatch = rawDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)

  if (isoDateMatch) {
    year = Number(isoDateMatch[1])
    month = Number(isoDateMatch[2])
    day = Number(isoDateMatch[3])
  } else if (usDateMatch) {
    month = Number(usDateMatch[1])
    day = Number(usDateMatch[2])
    year = Number(usDateMatch[3])
  } else {
    return null
  }

  if (!year || !month || !day) return null

  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  const formattedMonth = String(month).padStart(2, "0")
  const formattedDay = String(day).padStart(2, "0")

  return `${formattedMonth}-${formattedDay}-${year}`
}

function getAirportDisplayLabel(code: string) {
  const airport = airportDirectory[code]

  if (!airport) return code

  return `${airport.city} (${code})`
}

function getAirportReferenceForPrompt() {
  return Object.entries(airportDirectory)
    .sort(([codeA, airportA], [codeB, airportB]) => {
      const countryCompare = airportA.country.localeCompare(airportB.country)
      if (countryCompare !== 0) return countryCompare

      const cityCompare = airportA.city.localeCompare(airportB.city)
      if (cityCompare !== 0) return cityCompare

      return codeA.localeCompare(codeB)
    })
    .map(
      ([code, airport]) =>
        `${code}: ${airport.city}, ${airport.country} — ${airport.name}`
    )
    .join("\n")
}

function getAmbiguousAirportReferenceForPrompt() {
  const groupedByCity = Object.entries(airportDirectory).reduce<
    Record<string, Array<{ code: string; city: string; country: string; name: string }>>
  >((groups, [code, airport]) => {
    const key = airport.city.trim().toLowerCase()

    if (!groups[key]) {
      groups[key] = []
    }

    groups[key].push({
      code,
      city: airport.city,
      country: airport.country,
      name: airport.name,
    })

    return groups
  }, {})

  return Object.values(groupedByCity)
    .filter((airports) => airports.length > 1)
    .map((airports) => {
      const city = airports[0]?.city ?? "Unknown city"

      const options = airports
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((airport) => `${airport.code} ${airport.name}, ${airport.country}`)
        .join("; ")

      return `${city}: ${options}`
    })
    .join("\n")
}

function cleanLucyWatchlistAction(value: unknown): LucyWatchlistAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<LucyWatchlistAction>

  if (input.type !== "add_watchlist_route") return null

  const origin = cleanAirportCode(input.origin)
  const destination = cleanAirportCode(input.destination)
  const departureDate = cleanDepartureDate(input.departureDate)

  if (!origin || !destination || !departureDate) return null
  if (origin === destination) return null

  const originLabel = getAirportDisplayLabel(origin)
  const destinationLabel = getAirportDisplayLabel(destination)

  return {
    type: "add_watchlist_route",
    status: "needs_confirmation",
    origin,
    destination,
    departureDate,
    routeLabel:
      typeof input.routeLabel === "string" && input.routeLabel.trim()
        ? input.routeLabel.trim().slice(0, 120)
        : `${originLabel} → ${destinationLabel}`,
    confirmationPrompt:
      typeof input.confirmationPrompt === "string" &&
        input.confirmationPrompt.trim()
        ? input.confirmationPrompt.trim().slice(0, 240)
        : `Would you like me to add ${originLabel} → ${destinationLabel} for ${departureDate} to your watchlist?`,
  }
}

function cleanLucyPreferredAirportsAction(
  value: unknown
): LucyPreferredAirportsAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as {
    type?: unknown
    airportCodes?: unknown
    airportCode?: unknown
    confirmationPrompt?: unknown
  }

  if (input.type !== "save_preferred_airports") return null

  const rawAirportCodes = Array.isArray(input.airportCodes)
    ? input.airportCodes
    : input.airportCode
      ? [input.airportCode]
      : []

  const airportCodes = Array.from(
    new Set(
      rawAirportCodes
        .map(cleanAirportCode)
        .filter((code): code is string => Boolean(code))
    )
  )

  if (!airportCodes.length) return null

  const airportLabels = airportCodes.map(getAirportDisplayLabel)

  return {
    type: "save_preferred_airports",
    status: "needs_confirmation",
    airportCodes,
    airportLabels,
    confirmationPrompt:
      typeof input.confirmationPrompt === "string" &&
        input.confirmationPrompt.trim()
        ? input.confirmationPrompt.trim().slice(0, 240)
        : `Would you like me to save ${airportLabels.join(
          " and "
        )} as preferred airports?`,
  }
}

function cleanLucySaveFirstNameAction(
  value: unknown
): LucySaveFirstNameAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<LucySaveFirstNameAction>

  if (input.type !== "save_first_name") return null

  const firstName =
    typeof input.firstName === "string"
      ? input.firstName.trim().replace(/\s+/g, " ")
      : ""

  if (!firstName || firstName.length > 80) return null

  return {
    type: "save_first_name",
    status: "needs_confirmation",
    firstName,
    confirmationPrompt:
      typeof input.confirmationPrompt === "string" &&
        input.confirmationPrompt.trim()
        ? input.confirmationPrompt.trim().slice(0, 240)
        : `Would you like me to save ${firstName} as your first name for future Skysirv sessions?`,
  }
}

function cleanLucyPreferredRouteAction(
  value: unknown
): LucyPreferredRouteAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<LucyPreferredRouteAction>

  if (input.type !== "save_preferred_route") return null

  const origin = cleanAirportCode(input.origin)
  const destination = cleanAirportCode(input.destination)

  if (!origin || !destination) return null
  if (origin === destination) return null

  const originLabel = getAirportDisplayLabel(origin)
  const destinationLabel = getAirportDisplayLabel(destination)

  return {
    type: "save_preferred_route",
    status: "needs_confirmation",
    origin,
    destination,
    routeLabel:
      typeof input.routeLabel === "string" && input.routeLabel.trim()
        ? input.routeLabel.trim().slice(0, 120)
        : `${originLabel} → ${destinationLabel}`,
    confirmationPrompt:
      typeof input.confirmationPrompt === "string" &&
        input.confirmationPrompt.trim()
        ? input.confirmationPrompt.trim().slice(0, 240)
        : `Would you like me to save ${originLabel} → ${destinationLabel} as a preferred route?`,
  }
}

function cleanLucySaveVisibleFlightAction(
  value: unknown
): LucySaveVisibleFlightAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<LucySaveVisibleFlightAction>

  if (input.type !== "save_visible_flight") return null

  const origin = cleanAirportCode(input.origin)
  const destination = cleanAirportCode(input.destination)

  if (!origin || !destination) return null
  if (origin === destination) return null

  const departureDate =
    typeof input.departureDate === "string" && input.departureDate.trim()
      ? input.departureDate.trim().slice(0, 40)
      : null

  const airline =
    typeof input.airline === "string" && input.airline.trim()
      ? input.airline.trim().toUpperCase().slice(0, 20)
      : null

  const airlineName =
    typeof input.airlineName === "string" && input.airlineName.trim()
      ? input.airlineName.trim().slice(0, 120)
      : null

  const flightNumber =
    typeof input.flightNumber === "string" && input.flightNumber.trim()
      ? input.flightNumber.trim().toUpperCase().slice(0, 40)
      : null

  const price =
    typeof input.price === "number" && Number.isFinite(input.price)
      ? input.price
      : null

  const currency =
    typeof input.currency === "string" && input.currency.trim()
      ? input.currency.trim().toUpperCase().slice(0, 8)
      : "USD"

  const flightLabel =
    typeof input.flightLabel === "string" && input.flightLabel.trim()
      ? input.flightLabel.trim().slice(0, 160)
      : `${airlineName || airline || "Flight"}${flightNumber ? ` ${flightNumber}` : ""}`

  return {
    type: "save_visible_flight",
    status: "needs_confirmation",
    origin,
    destination,
    departureDate,
    airline,
    airlineName,
    flightNumber,
    price,
    currency,
    flightLabel,
    confirmationPrompt:
      typeof input.confirmationPrompt === "string" &&
        input.confirmationPrompt.trim()
        ? input.confirmationPrompt.trim().slice(0, 240)
        : `Save ${flightLabel} from ${origin} to ${destination} to your Saved Flights?`,
  }
}

function cleanLucySuggestedAction(value: unknown): LucySuggestedAction | null {
  if (!value || typeof value !== "object") return null

  const input = value as { type?: unknown }

  if (input.type === "add_watchlist_route") {
    return cleanLucyWatchlistAction(value)
  }

  if (input.type === "save_preferred_airports") {
    return cleanLucyPreferredAirportsAction(value)
  }

  if (input.type === "save_preferred_route") {
    return cleanLucyPreferredRouteAction(value)
  }

  if (input.type === "save_first_name") {
    return cleanLucySaveFirstNameAction(value)
  }

  if (input.type === "save_visible_flight") {
    return cleanLucySaveVisibleFlightAction(value)
  }

  return null
}

function parseLucyStructuredChatResponse(rawText: string): LucyStructuredChatResponse {
  const fallbackReply =
    rawText.trim() ||
    "I’m here, but I could not generate a clean response."

  function parseJsonCandidate(candidate: string) {
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }

  const parsedDirect = parseJsonCandidate(rawText)
  const parsedFromBlock =
    parsedDirect ??
    parseJsonCandidate(rawText.match(/\{[\s\S]*\}/)?.[0] ?? "")

  if (!parsedFromBlock || typeof parsedFromBlock !== "object") {
    return {
      reply: fallbackReply,
      action: null,
    }
  }

  const input = parsedFromBlock as {
    reply?: unknown
    action?: unknown
    suggestedAction?: unknown
  }

  const reply =
    typeof input.reply === "string" && input.reply.trim()
      ? input.reply.trim().slice(0, 1800)
      : fallbackReply

  return {
    reply,
    action: cleanLucySuggestedAction(input.action ?? input.suggestedAction),
  }
}

const LUCY_SHARED_TRAINING_PROMPT = `
You are Lucy, the Skysirv Flight Attendant, a premium AI travel intelligence assistant built into Skysirv.

Your job:
Help travelers understand airfare timing, route behavior, fare movement, booking confidence, alerts, Skyscore, watchlists, saved routes, account preferences, plans, subscriptions, and Skysirv's flight intelligence features.

Tone:
Calm, warm, cozy, coy, spoony, polished, confident, concise, premium, and conversational.
Sound like Lucy, Skysirv’s premium in-product flight intelligence concierge.
Do not sound like a generic chatbot.
Do not end replies with vague assistant phrases like “If you want...” or “Let me know...”
When offering a next step, make it specific, Skysirv-native, and useful.

Truthfulness:
Use provided Skysirv account, dashboard, route, watchlist, saved route, preferred airport, alert, and subscription context as the source of truth.
Do not claim access to live flight inventory, live airline availability, live booking data, alerts, account settings, saved routes, or watchlist changes unless Skysirv provides that data or confirms the backend action.
Do not claim that something has been added, saved, updated, tracked, remembered, alerted, notified, configured, or changed unless backend/frontend confirmation is provided.

Scope:
Stay focused on Skysirv, airfare intelligence, route monitoring, watchlists, saved routes, saved flights, fare signals, Skyscore, booking timing, booking confidence, travel planning, plans, plan pricing, upgrades, subscriptions, account settings, alerts, and travel decision support.
Questions about Skysirv plans, plan pricing, upgrading, subscription tiers, route limits, or Business features are in-scope and should be answered using available plan context.
Lucy must refuse unrelated requests.

Unrelated requests include, but are not limited to:
cooking, recipes, poems, jokes, coding, homework, medical advice, legal advice, financial advice, general trivia, relationship advice, lifestyle advice, entertainment, sports, politics, or anything not connected to Skysirv or travel decision support.

For unrelated requests, do not answer the actual question.
Give one brief redirect back to Skysirv.

Use this exact style for unrelated requests:
“I’m focused on Skysirv flight intelligence, so I can’t help with that here. I can help with your plan, route tracking, fare signals, watchlists, or booking confidence.”

Personalization:
If first name is saved, greet the user naturally by first name.
If first name is not saved and the user shares their name, ask whether they would like Lucy to save it to their Skysirv profile for future sessions.
Never claim the name has been saved unless Skysirv confirms the backend action.
Once Skysirv confirms a first name was saved successfully, respond confidently and naturally.
Do not say the save may take time.
Example: “Perfect — I’ll remember your name for future Skysirv sessions, Tony.”

Formatting:
Use plain conversational text.
Do not use markdown headings.
Do not use asterisks for bold.
Do not use raw markdown syntax.
Use short paragraphs.
Use simple bullets only when they genuinely improve readability.
Avoid generic closing lines.
`.trim()

const FLIGHT_ATTENDANT_SYSTEM_PROMPT = `
${LUCY_SHARED_TRAINING_PROMPT}

Text chat behavior:
Lucy can help explain routes, fare behavior, Skyscore, booking confidence, watchlists, saved routes, preferred airports, preferred routes, alerts, plans, subscriptions, and Skysirv account features.

When useful, ask one clear follow-up question instead of asking for many things at once.

Prefer specific Skysirv follow-ups, such as:
“Would you like me to break down your remaining route capacity?”
“Would you like a quick readout of what your current tracked routes are showing?”
“Would you like me to explain what your plan unlocks inside Skysirv?”

Route-management behavior:
If a user asks Lucy to track, add, remove, update, manage, save, alert, or remember a route, treat that as an in-scope Skysirv route-management request.

When a user mentions a route with enough detail to identify origin, destination, and departure date, Lucy may ask whether the user would like that route added to the watchlist.

Preferred airports and preferred routes are in-scope Skysirv account preferences.

If the user asks whether preferred routes or preferred airports will be remembered in future sessions, explain that Skysirv can store those preferences once confirmed and saved.

Action safety:
Do not claim any watchlist action, alert action, route save, preferred airport save, preferred route save, or profile save was completed unless backend or frontend confirmation is explicitly provided.

If user-specific Skysirv data is not provided, say what you can infer generally and what information would be needed.

Structured action format:
When Lucy detects a valid route-management or account-preference request, Lucy may return a structured JSON action object.

Allowed structured actions:
{
  "action": {
    "type": "add_watchlist_route",
    "status": "needs_confirmation",
    "origin": "BOS",
    "destination": "MIA",
    "departureDate": "05-22-2026",
    "routeLabel": "Boston (BOS) → Miami (MIA)",
    "confirmationPrompt": "Would you like me to add Boston (BOS) → Miami (MIA) on May 22, 2026 to your watchlist?"
  }
}

{
  "action": {
    "type": "save_preferred_airports",
    "status": "needs_confirmation",
    "airportCodes": ["MIA", "JFK"],
    "airportLabels": ["Miami International", "John F. Kennedy International"],
    "confirmationPrompt": "Would you like me to save Miami International and John F. Kennedy International as preferred airports?"
  }
}

{
  "action": {
    "type": "save_preferred_route",
    "status": "needs_confirmation",
    "origin": "JFK",
    "destination": "LHR",
    "routeLabel": "New York (JFK) → London (LHR)",
    "confirmationPrompt": "Would you like me to save New York (JFK) → London (LHR) as a preferred route?"
  }
}

{
  "action": {
    "type": "save_first_name",
    "status": "needs_confirmation",
    "firstName": "Tony",
    "confirmationPrompt": "Would you like me to save Tony as your first name for future Skysirv sessions?"
  }
}

First name memory rules:
- If the user says their name or asks whether Lucy knows their name and firstName is not saved, ask what name they would like Lucy to use.
- If the user clearly provides a first name, return a save_first_name action and ask for confirmation before saving.
- Never claim the name is saved unless Skysirv confirms it.
- Use only a reasonable first name, not a full sentence.
- If the user says "my name is Tony", firstName should be "Tony".
`.trim()

function cleanMessageText(value: unknown) {
  if (typeof value !== "string") return ""

  return value.trim().slice(0, MAX_MESSAGE_LENGTH)
}

function isClearlyOffTopic(message: string) {
  const normalized = message.toLowerCase()

  const travelOrSkysirvSignals = [
    "skysirv",
    "flight",
    "fare",
    "route",
    "watchlist",
    "track",
    "booking",
    "book",
    "airport",
    "airline",
    "ticket",
    "trip",
    "travel",
    "plan",
    "subscription",
    "lucy",
    "skyscore",
    "price",
    "prices",
    "pro",
    "free",
    "business",
  ]

  const offTopicSignals = [
    "cook",
    "dinner",
    "recipe",
    "meal",
    "poem",
    "joke",
    "coding",
    "code",
    "homework",
    "math",
    "medical",
    "doctor",
    "legal",
    "lawyer",
    "financial advice",
    "relationship",
    "sports",
    "politics",
    "movie",
    "song",
  ]

  const hasTravelOrSkysirvSignal = travelOrSkysirvSignals.some((signal) =>
    normalized.includes(signal)
  )

  const hasOffTopicSignal = offTopicSignals.some((signal) =>
    normalized.includes(signal)
  )

  return hasOffTopicSignal && !hasTravelOrSkysirvSignal
}

function normalizeConversation(body: FlightAttendantChatBody) {
  const normalized: Array<{
    role: FlightAttendantRole
    content: string
  }> = []

  if (Array.isArray(body.messages)) {
    for (const item of body.messages) {
      const role = item.role === "assistant" ? "assistant" : "user"
      const content = cleanMessageText(item.content ?? item.text)

      if (!content) continue

      normalized.push({
        role,
        content,
      })
    }
  }

  const directMessage = cleanMessageText(body.message)

  if (directMessage) {
    const lastMessage = normalized[normalized.length - 1]

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.content !== directMessage
    ) {
      normalized.push({
        role: "user",
        content: directMessage,
      })
    }
  }

  return normalized.slice(-MAX_CONVERSATION_MESSAGES)
}

function normalizeFlightSearchText(value?: string | null) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "")
}

function isVisibleFlightSaveIntent(message: string) {
  const normalized = message.trim().toLowerCase()

  if (!normalized) return false

  const mentionsSave =
    normalized.includes("save") ||
    normalized.includes("saved flights") ||
    normalized.includes("add it to my saved flights")

  const mentionsFlight =
    normalized.includes("flight") ||
    normalized.includes("that one") ||
    normalized.includes("this one") ||
    normalized.includes("save it") ||
    normalized.includes("save that")

  return mentionsSave && mentionsFlight
}

function formatReadableDate(value?: string | null) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatVisibleFlightPrice(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function buildVisibleFlightSaveResponse({
  latestUserMessage,
  conversation,
  dashboardRoutes,
}: {
  latestUserMessage: string
  conversation: Array<{
    role: FlightAttendantRole
    content: string
  }>
  dashboardRoutes: FlightAttendantDashboardRouteContext[]
}): LucyStructuredChatResponse | null {
  if (!isVisibleFlightSaveIntent(latestUserMessage)) return null

  const visibleFlights = dashboardRoutes.flatMap((route) => {
    const origin = cleanAirportCode(route.origin)
    const destination = cleanAirportCode(route.destination)

    if (!origin || !destination) return []

    const flights = Array.isArray(route.recommendedFlights)
      ? route.recommendedFlights
      : []

    return flights
      .filter((flight) => flight.flightNumber || flight.airline || flight.airlineName)
      .map((flight) => ({
        route,
        origin,
        destination,
        flight,
        normalizedFlightNumber: normalizeFlightSearchText(flight.flightNumber),
      }))
  })

  if (!visibleFlights.length) {
    return {
      reply:
        "I can help save visible dashboard flights, but I don’t see any available flight options in the current dashboard context yet.",
      action: null,
    }
  }

  const conversationNewestFirst = [...conversation].reverse()

  const matchedByRecentFlightNumber = conversationNewestFirst
    .flatMap((message) => {
      const messageText = normalizeFlightSearchText(message.content)

      return visibleFlights.filter(
        (candidate) =>
          candidate.normalizedFlightNumber &&
          messageText.includes(candidate.normalizedFlightNumber)
      )
    })
    .at(0)

  const matchedFlight = matchedByRecentFlightNumber

  if (!matchedFlight) {
    return {
      reply:
        "I can save a visible flight to your Saved Flights. Which flight number should I save?",
      action: null,
    }
  }

  const { route, origin, destination, flight } = matchedFlight

  const airline =
    typeof flight.airline === "string" && flight.airline.trim()
      ? flight.airline.trim().toUpperCase()
      : null

  const airlineName =
    typeof flight.airlineName === "string" && flight.airlineName.trim()
      ? flight.airlineName.trim()
      : null

  const flightNumber =
    typeof flight.flightNumber === "string" && flight.flightNumber.trim()
      ? flight.flightNumber.trim().toUpperCase()
      : null

  const currency =
    typeof flight.currency === "string" && flight.currency.trim()
      ? flight.currency.trim().toUpperCase()
      : "USD"

  const price =
    typeof flight.price === "number" && Number.isFinite(flight.price)
      ? flight.price
      : null

  const departureDate =
    typeof route.departureDate === "string" && route.departureDate.trim()
      ? route.departureDate.trim()
      : null

  const readableDate = formatReadableDate(departureDate)
  const priceLabel = formatVisibleFlightPrice(price, currency)

  const flightLabel = `${airlineName || airline || "Flight"}${flightNumber ? ` ${flightNumber}` : ""
    }`.trim()

  const routeLabel = `${origin} → ${destination}`

  const detailParts = [
    routeLabel,
    readableDate ? `on ${readableDate}` : null,
    priceLabel ? `for ${priceLabel}` : null,
  ].filter(Boolean)

  const confirmationPrompt = `Save ${flightLabel} ${detailParts.join(
    " "
  )} to your Saved Flights?`

  return {
    reply: confirmationPrompt,
    action: {
      type: "save_visible_flight",
      status: "needs_confirmation",
      origin,
      destination,
      departureDate,
      airline,
      airlineName,
      flightNumber,
      price,
      currency,
      flightLabel,
      confirmationPrompt,
    },
  }
}

function normalizePlanId(planId: string | null | undefined) {
  const value = (planId || "free").toLowerCase()

  if (value.includes("pro")) return "pro"
  if (value.includes("business") || value.includes("enterprise")) return "business"

  return "free"
}

function getLucyAccessLevel(normalizedPlan: string) {
  if (normalizedPlan === "business") return "Advanced"
  if (normalizedPlan === "pro") return "Standard"

  return "Limited"
}

function getPlanDisplayName(normalizedPlan: string) {
  if (normalizedPlan === "business") return "Business"
  if (normalizedPlan === "pro") return "Pro"

  return "Free"
}

function getRouteLimit(normalizedPlan: string) {
  if (normalizedPlan === "business") {
    return {
      value: null as number | null,
      label: "unlimited tracked routes",
    }
  }

  if (normalizedPlan === "pro") {
    return {
      value: 25,
      label: "25 tracked routes",
    }
  }

  return {
    value: 3,
    label: "3 tracked routes",
  }
}

function formatMembershipDuration(createdAt: Date | string | null | undefined) {
  if (!createdAt) return "unknown"

  const createdDate = new Date(createdAt)
  const now = new Date()

  if (Number.isNaN(createdDate.getTime())) return "unknown"

  const diffMs = now.getTime() - createdDate.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

  if (diffDays < 1) return "less than 1 day"
  if (diffDays === 1) return "1 day"
  if (diffDays < 30) return `${diffDays} days`

  const diffMonths = Math.floor(diffDays / 30)

  if (diffMonths === 1) return "about 1 month"
  if (diffMonths < 12) return `about ${diffMonths} months`

  const diffYears = Math.floor(diffMonths / 12)
  const remainingMonths = diffMonths % 12

  if (diffYears === 1 && remainingMonths === 0) return "about 1 year"
  if (diffYears === 1) return `about 1 year and ${remainingMonths} months`
  if (remainingMonths === 0) return `about ${diffYears} years`

  return `about ${diffYears} years and ${remainingMonths} months`
}

async function getLucyAccountContext({
  app,
  userId,
  frontendTier,
}: {
  app: FastifyInstance
  userId: string
  frontendTier?: "free" | "pro" | "business"
}) {
  const user = await app.db
    .selectFrom("users")
    .select(["id", "email", "created_at", "is_verified", "first_name"])
    .where("id", "=", userId)
    .executeTakeFirst()

  const activeSubscription = await app.db
    .selectFrom("subscriptions")
    .select([
      "id",
      "plan_id",
      "status",
      "billing_interval",
      "current_period_end",
      "created_at",
    ])
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .orderBy("created_at", "desc")
    .executeTakeFirst()

  const rawPlanId = activeSubscription?.plan_id ?? "free"
  const normalizedPlan = normalizePlanId(rawPlanId)
  const planDisplayName = getPlanDisplayName(normalizedPlan)
  const lucyAccessLevel = getLucyAccessLevel(normalizedPlan)
  const routeLimit = getRouteLimit(normalizedPlan)

  const watchlistCountResult = await app.db
    .selectFrom("watchlist")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst()

  const currentTrackedRoutes = Number(watchlistCountResult?.count ?? 0)

  const preferredAirports = await app.db
    .selectFrom("user_preferred_airports")
    .select([
      "airport_code",
      "airport_name",
      "city",
      "country",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute()

  const preferredRoutes = await app.db
    .selectFrom("user_preferred_routes")
    .select([
      "origin",
      "destination",
      "origin_airport_name",
      "destination_airport_name",
      "origin_city",
      "destination_city",
      "origin_country",
      "destination_country",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute()

  const remainingTrackedRoutes =
    routeLimit.value === null
      ? "unlimited"
      : Math.max(routeLimit.value - currentTrackedRoutes, 0)

  return {
    userEmail: user?.email || "unknown",
    firstName: user?.first_name || null,
    accountCreatedAt: user?.created_at || null,
    membershipDuration: formatMembershipDuration(user?.created_at),
    isVerified: Boolean(user?.is_verified),
    rawPlanId,
    normalizedPlan,
    planDisplayName,
    lucyAccessLevel,
    subscriptionStatus: activeSubscription?.status || "active",
    billingInterval: activeSubscription?.billing_interval || "none",
    currentPeriodEnd: activeSubscription?.current_period_end || null,
    routeLimitLabel: routeLimit.label,
    routeLimitValue: routeLimit.value,
    currentTrackedRoutes,
    remainingTrackedRoutes,
    preferredAirports,
    preferredRoutes,
    frontendTier: frontendTier || "not provided",
  }
}

function buildDashboardSummaryInput({
  user,
  accountContext,
  watchlist,
}: {
  user: { id: string; email?: string }
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
  watchlist: Awaited<ReturnType<typeof getUserWatchlist>>
}) {
  const routes = watchlist.slice(0, 12).map((route) => ({
    origin: route.origin,
    destination: route.destination,
    departureDate: route.departure_date,
    latestPrice: route.latest_price,
    averagePrice: route.avg_price ? Number(route.avg_price) / 100 : null,
    latestAirline: route.latest_airline,
    latestFlightNumber: route.latest_flight_number,
    latestCapturedAt: route.latest_captured_at,
    bookingSignal: route.booking_signal,
    volatilityIndex: route.volatility_index,
    recommendedFlightsCount: Array.isArray(route.recommended_flights)
      ? route.recommended_flights.length
      : 0,
  }))

  return [
    {
      role: "system" as const,
      content: `
You are Lucy, the Skysirv Flight Attendant.

Create one concise dashboard intelligence summary for an authenticated Skysirv user.

Return strict JSON only.
Do not include markdown.
Do not include commentary outside the JSON.

The JSON must match this exact shape:
{
  "headline": "string",
  "summary": "string",
  "signalFeed": ["string", "string", "string"],
  "systemReadout": "string",
  "recommendedAction": "watch" | "wait" | "book" | "insufficient_data",
  "confidence": "low" | "medium" | "high",
  "dataStatus": "pending" | "building" | "ready"
}

Rules:
- Never invent prices, airlines, alerts, savings, trends, or route movement.
- Only mention a route-specific signal if the provided data supports it.
- If route history is thin or missing, say intelligence is still building.
- Keep the tone premium, calm, warm, and useful.
- Use the name Lucy only when it feels natural.
- Keep the summary under 90 words.
- Use 2 to 4 signalFeed items.
- Make the systemReadout short and operational.
- recommendedAction should be "insufficient_data" unless there is enough route data to support "watch", "wait", or "book".
- confidence should usually be "low" when latest prices or route history are missing.
- dataStatus should be "pending" when there are no watched routes, "building" when routes exist but data is thin, and "ready" only when enough fare data exists.

User/account context:
User ID: ${user.id}
Email: ${accountContext.userEmail || user.email || "unknown"}
Plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Tracked routes: ${accountContext.currentTrackedRoutes}
Route limit: ${accountContext.routeLimitLabel}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}

Watchlist route context:
${JSON.stringify(routes, null, 2)}
`.trim(),
    },
  ]
}

function buildOpenAIInput({
  user,
  accountContext,
  conversation,
  dashboardRoutes,
}: {
  user: { id: string; email?: string }
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
  conversation: Array<{
    role: FlightAttendantRole
    content: string
  }>
  dashboardRoutes: FlightAttendantDashboardRouteContext[]
}) {
  return [
    {
      role: "system" as const,
      content: `${FLIGHT_ATTENDANT_SYSTEM_PROMPT}

Authenticated Skysirv user:
User ID: ${user.id}
Email: ${accountContext.userEmail || user.email || "unknown"}
First name: ${accountContext.firstName || "not saved yet"}
Verified account: ${accountContext.isVerified ? "yes" : "no"}
Account created at: ${accountContext.accountCreatedAt || "unknown"}
Membership duration: ${accountContext.membershipDuration}

Subscription/account context:
Raw plan ID: ${accountContext.rawPlanId}
Normalized plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Subscription status: ${accountContext.subscriptionStatus}
Billing interval: ${accountContext.billingInterval}
Current period end: ${accountContext.currentPeriodEnd || "none"}

Route/watchlist context:
Tracked route limit: ${accountContext.routeLimitLabel}
Current tracked routes: ${accountContext.currentTrackedRoutes}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}

Current dashboard route/watchlist context:
${JSON.stringify(
        dashboardRoutes.slice(0, 12).map((route) => ({
          id: route.id || null,
          origin: route.origin || null,
          destination: route.destination || null,
          departureDate: route.departureDate || null,
          routeLabel: route.routeLabel || null,
          latestPrice: route.latestPrice ?? null,
          averagePrice: route.averagePrice ?? null,
          bookingSignal: route.bookingSignal || null,
          recommendedFlights: Array.isArray(route.recommendedFlights)
            ? route.recommendedFlights.slice(0, 8)
            : [],
        })),
        null,
        2
      )}


Saved preferred airport context:
${JSON.stringify(
        accountContext.preferredAirports.map((airport) => ({
          code: airport.airport_code,
          city: airport.city,
          country: airport.country,
          name: airport.airport_name,
        })),
        null,
        2
      )}

Saved preferred route context:
${JSON.stringify(
        accountContext.preferredRoutes.map((route) => ({
          origin: route.origin,
          destination: route.destination,
          label: `${route.origin_city} (${route.origin}) → ${route.destination_city} (${route.destination})`,
          originAirportName: route.origin_airport_name,
          destinationAirportName: route.destination_airport_name,
        })),
        null,
        2
      )}

Frontend dashboard tier hint: ${accountContext.frontendTier}

Use the subscription/account context above as the source of truth when answering questions about the user's plan, Lucy access level, route limit, tracked route count, remaining routes, subscription status, membership duration, saved preferred airports, or saved preferred routes.

Dashboard flight availability rules:
- The current dashboard route/watchlist context above is trusted Skysirv dashboard data for the user's visible dashboard.
- recommendedFlights are the visible recommended flight cards currently available on the dashboard.
- If the user asks “what flights are available?”, “what flights do I have?”, “show me available flights”, “what are my options?”, or asks about flights for a specific watched route, answer from recommendedFlights.
- If recommendedFlights exist for a matching route, do not say you lack flight context.
- If recommendedFlights exist, summarize up to 4 options using airlineName when available, otherwise airline code, flightNumber, price, currency, and whether the flight is direct or has stops.
- If the user asks for the cheapest visible flight, choose the lowest price from recommendedFlights.
- If the user asks about a route like JFK to MIA, match by origin and destination first, then routeLabel.
- If no matching route is specified, summarize the routes that currently have recommendedFlights.
- If the matching route exists but recommendedFlights is empty, say visible flight options are still building for that route.
- Do not call these guaranteed live airline inventory. Call them visible Skysirv dashboard flight options or recommended fare options.
- Do not invent airlines, prices, flight numbers, routes, or availability.
- If the user asks to save a visible flight, do not say Skysirv cannot save flights. Say you can help save a visible flight once they choose or confirm the specific option. Backend save action may require confirmation.

When the user asks what their preferred airports or preferred routes are, answer from the saved preferred airport context and saved preferred route context above.

If saved preferred routes exist, do not say you only know them from this session.

If saved preferred airports or preferred routes are empty, say none are saved yet and offer to save one.

Preferred airports and preferred routes are account-level Skysirv preferences. Once saved through the backend, they are available in future dashboard sessions.

Important plan facts:
Free does not include Lucy access. Free users can track up to 3 routes without Lucy.
Pro includes Standard Lucy access and up to 25 tracked routes.
Business includes Advanced Lucy access and unlimited tracked routes.

If the frontend dashboard tier hint conflicts with the subscription/account context, trust the subscription/account context.

Current server date: ${new Date().toISOString().slice(0, 10)}

Supported Skysirv airport directory:
${getAirportReferenceForPrompt()}

Known multi-airport or ambiguous cities:
${getAmbiguousAirportReferenceForPrompt() || "none"}

Airport resolution rules:
- Use only airport codes from the Supported Skysirv airport directory.
- If the user provides an airport code, validate and use that code.
- If the user provides a city with exactly one supported airport, use that airport code.
- If the city has multiple supported airports, ask which airport they want and return action: null.
- Do not guess between airports in ambiguous cities such as New York, London, Paris, Milan, Washington, Chicago, Buenos Aires, Sao Paulo, Rio de Janeiro, Seoul, Tokyo, Osaka, Beijing, or Shanghai.
- If the city or airport is not in the supported directory, ask the user for the closest supported airport code and return action: null.

Structured response requirement:
Return strict JSON only.
Do not include markdown.
Do not include commentary outside the JSON.

The JSON must match this shape:
{
  "reply": "string",
  "action": null | {
    "type": "add_watchlist_route",
    "status": "needs_confirmation",
    "origin": "BOS",
    "destination": "BCN",
    "departureDate": "MM-DD-YYYY",
    "routeLabel": "Boston (BOS) → Barcelona (BCN)",
    "confirmationPrompt": "Would you like me to add Boston (BOS) → Barcelona (BCN) for MM-DD-YYYY to your watchlist?"
  } | {
    "type": "save_preferred_airports",
    "status": "needs_confirmation",
    "airportCodes": ["JFK", "LHR"],
    "airportLabels": ["New York (JFK)", "London (LHR)"],
    "confirmationPrompt": "Would you like me to save New York (JFK) and London (LHR) as preferred airports?"
  } | {
    "type": "save_preferred_route",
    "status": "needs_confirmation",
    "origin": "JFK",
    "destination": "LHR",
    "routeLabel": "New York (JFK) → London (LHR)",
    "confirmationPrompt": "Would you like me to save New York (JFK) → London (LHR) as a preferred route?"
  } | {
    "type": "save_first_name",
    "status": "needs_confirmation",
    "firstName": "Tony",
    "confirmationPrompt": "Would you like me to save Tony as your first name for future Skysirv sessions?"
  } | {
    "type": "save_visible_flight",
    "status": "needs_confirmation",
    "origin": "JFK",
    "destination": "MIA",
    "departureDate": "2026-05-28",
    "airline": "AA",
    "airlineName": "American Airlines",
    "flightNumber": "AA2026",
    "price": 268,
    "currency": "USD",
    "flightLabel": "American Airlines AA2026",
    "confirmationPrompt": "Save American Airlines AA2026 from JFK to MIA to your Saved Flights?"
  }
}

Action rules:
- Use supported Skysirv airport codes from the provided airport directory for origin and destination.
- For add_watchlist_route actions, only include an action when the user has provided or confirmed a clear origin airport, destination airport, and departure date.
- For add_watchlist_route actions, use MM-DD-YYYY inside action.departureDate because the backend action expects that format.
- For add_watchlist_route actions, never use YYYY-MM-DD, MM/DD/YYYY, or natural language dates inside action.departureDate.
- For example, May 22, 2026 must be returned inside action.departureDate as "05-22-2026".
- In user-facing reply text and confirmationPrompt, use a natural readable date like “May 22, 2026” whenever possible.
- The action object may use "05-22-2026", but the user-facing confirmation should say something like: "Would you like me to add Boston to Miami on May 22, 2026 to your watchlist?"
- For save_visible_flight actions, use the departureDate from the matching dashboard route context. YYYY-MM-DD is allowed for save_visible_flight because Saved Flights accepts dashboard route dates.
- For save_visible_flight user-facing confirmationPrompt, use a natural readable date if a date is available.
- Do not say "confirmed", "preparing", or "I’m preparing" when the user has not yet completed the backend watchlist or saved-flight action.
- The correct wording before backend confirmation is: "Would you like me to add this route to your watchlist?" or "Would you like me to save this flight to your Saved Flights?"
- No duplicate messages.

Saved flight action rules:
- Important: When the user says “save that flight,” “save it,” “save this one,” or asks to save a specific flight after discussing a recommendedFlights option, this means save_visible_flight, not add_watchlist_route.
- Never convert a request to save a visible flight into an add_watchlist_route action.
- add_watchlist_route is only for tracking a route, not saving a specific flight card.
- If the user asks to save a visible flight, return a save_visible_flight action when the specific visible flight can be identified from recommendedFlights.
- Match visible flights by flightNumber first, then airlineName or airline code, then price if needed.
- Only save flights that appear in the provided recommendedFlights context.
- Do not say Skysirv cannot save individual flights.
- Do not claim the flight has been saved until frontend/backend confirmation is provided.
- Before backend confirmation, return the save_visible_flight action with action.confirmationPrompt.
- If the user says “save that flight” or “save it,” use the most recently discussed visible flight from the page-session conversation.
- If the flight is ambiguous, ask one short follow-up question and return action: null.

First name memory rules:
- If the user says their name or asks whether Lucy knows their name and firstName is not saved, ask what name they would like Lucy to use.
- If the user clearly provides a first name, return a save_first_name action and ask for confirmation before saving.
- Never claim the name is saved unless the frontend/backend confirms it.
- Use only a reasonable first name, not a full sentence.
- If the user says "my name is Tony", firstName should be "Tony".
- Once Skysirv confirms a first name was saved successfully, respond confidently and naturally.
- Do not say the save may take time.
- Example: "Perfect — I’ll remember your name for future Skysirv sessions, Tony."

Preferred airport and preferred route rules:
- If the user asks Lucy to remember, save, or use airports as preferred airports, return a save_preferred_airports action when the airport codes are clear.
- If the user says "these airports" or "those airports", infer from the current page-session conversation only if the airports were clearly discussed earlier.
- If the preferred airports are unclear, ask one concise follow-up question and return action: null.
- If the user asks Lucy to remember or save a route pair without needing a departure date, return a save_preferred_route action.
- Preferred routes do not require a departure date.
- Never claim preferred airports or preferred routes have been saved unless the frontend/backend confirms the save action.
- Before backend confirmation, ask: "Would you like me to save this as a preferred airport or route?"

The following is the current page-session conversation. Respond to the latest user message while respecting the prior context.`,
    },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

const LUCY_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"

const LUCY_REALTIME_VOICE =
  process.env.OPENAI_REALTIME_VOICE || "marin"

function buildLucyRealtimeInstructions(
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>,
  dashboardRoutes: FlightAttendantDashboardRouteContext[]
) {
  return `
${LUCY_SHARED_TRAINING_PROMPT}

Voice chat behavior:
You are speaking live with an authenticated Skysirv ${accountContext.planDisplayName} user.
Keep spoken answers short, natural, and easy to follow unless the user asks for more detail.

User/account context:
First name: ${accountContext.firstName || "not saved yet"}
Email: ${accountContext.userEmail}
Plan: ${accountContext.planDisplayName}
Lucy access level: ${accountContext.lucyAccessLevel}
Verified account: ${accountContext.isVerified ? "yes" : "no"}
Membership duration: ${accountContext.membershipDuration}
Tracked routes: ${accountContext.currentTrackedRoutes}
Route limit: ${accountContext.routeLimitLabel}
Remaining tracked routes: ${accountContext.remainingTrackedRoutes}
Billing interval: ${accountContext.billingInterval}
Subscription status: ${accountContext.subscriptionStatus}

Saved preferred airports:
${JSON.stringify(
    accountContext.preferredAirports.map((airport) => ({
      code: airport.airport_code,
      city: airport.city,
      country: airport.country,
      name: airport.airport_name,
    })),
    null,
    2
  )}

Current dashboard route/watchlist context:
${JSON.stringify(
    dashboardRoutes.slice(0, 12).map((route) => ({
      id: route.id || null,
      origin: route.origin || null,
      destination: route.destination || null,
      departureDate: route.departureDate || null,
      routeLabel: route.routeLabel || null,
      latestPrice: route.latestPrice ?? null,
      averagePrice: route.averagePrice ?? null,
      bookingSignal: route.bookingSignal || null,
      recommendedFlights: Array.isArray(route.recommendedFlights)
        ? route.recommendedFlights.slice(0, 8)
        : [],
    })),
    null,
    2
  )}

Saved preferred routes:
${JSON.stringify(
    accountContext.preferredRoutes.map((route) => ({
      origin: route.origin,
      destination: route.destination,
      label: `${route.origin_city} (${route.origin}) → ${route.destination_city} (${route.destination})`,
      originAirportName: route.origin_airport_name,
      destinationAirportName: route.destination_airport_name,
    })),
    null,
    2
  )}

Realtime action behavior:
If the user asks to add a route, save a route, configure alerts, update account settings, or remember a preference, do not claim it is completed.
Say Skysirv will ask for confirmation before saving or changing anything.

Use the account context above as truth.
If a value is missing, say it is not saved yet.

When the user asks to track or add a route and the origin, destination, and departure date are clear, call the prepare_watchlist_route tool.
Do not say the route has been added.
The tool only prepares the action. Skysirv must confirm with the user and save it through the backend.
Use MM-DD-YYYY for departure dates.

When the user asks to save a visible flight, save that flight, save it, save this one, or add a specific visible flight to Saved Flights, call the prepare_save_visible_flight tool.

A visible flight means a flight shown in the current dashboard route/watchlist recommendedFlights context.

If the user recently discussed a specific flight number, such as AA2026 or flight 2026, use that flight from recommendedFlights.

Never convert a request to save a specific visible flight into prepare_watchlist_route.

prepare_watchlist_route is only for tracking a route.
prepare_save_visible_flight is for saving a specific recommended flight card to the user's Saved Flights.

Do not say Skysirv cannot save individual flights.
Do not claim the flight has been saved until the frontend/backend confirms it.
Ask one short confirmation question before saving.

Voice behavior rules:
- Never initiate conversation after the voice session starts. Wait silently until the user clearly asks a Skysirv or travel-related question.
- Ignore coughing, breathing, silence, taps, keyboard sounds, fan noise, road noise, and background conversations. Do not respond unless the user clearly asks Lucy for Skysirv or travel help.
- Never narrate ambient sounds.
- Keep voice replies under one short sentence unless the user asks for more detail.
- After asking a confirmation question, wait silently for the user's answer.
- Never say “Skysirv will confirm.”
- Never say “You will see a prompt.”
- Never describe internal system behavior.
- For watchlist confirmations, ask one short question using the route: “Add Boston to Miami on May 22 to your watchlist?”
- After a route is actually added, say only: “Done — it’s on your watchlist.”
`.trim()
}

export async function flightAttendantRoutes(app: FastifyInstance) {
  app.post(
    "/flight-attendant/realtime-session",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }
      const body = request.body as {
        dashboardRoutes?: FlightAttendantDashboardRouteContext[]
      }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
      })

      if (accountContext.normalizedPlan === "free") {
        return reply.status(403).send({
          success: false,
          error: "Lucy is available on Pro and Business plans.",
          code: "LUCY_NOT_INCLUDED",
        })
      }

      if (!process.env.OPENAI_API_KEY) {
        request.log.error("OPENAI_API_KEY is missing for Lucy realtime session")

        return reply.status(500).send({
          success: false,
          error: "Lucy voice is not configured.",
          code: "OPENAI_KEY_MISSING",
        })
      }

      const openaiResponse = await fetch(
        "https://api.openai.com/v1/realtime/client_secrets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Safety-Identifier": user.id,
          },
          body: JSON.stringify({
            session: {
              type: "realtime",
              model: LUCY_REALTIME_MODEL,
              instructions: buildLucyRealtimeInstructions(
                accountContext,
                Array.isArray(body.dashboardRoutes) ? body.dashboardRoutes : []
              ),
              tools: [
                {
                  type: "function",
                  name: "prepare_watchlist_route",
                  description:
                    "Prepare a Skysirv watchlist route action when the user asks Lucy to track or add a route. This does not save the route yet; Skysirv must ask the user for confirmation first.",
                  parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      origin: {
                        type: "string",
                        description:
                          "Supported origin airport code, such as BOS, JFK, MIA, or LHR.",
                      },
                      destination: {
                        type: "string",
                        description:
                          "Supported destination airport code, such as BOS, JFK, MIA, or LHR.",
                      },
                      departureDate: {
                        type: "string",
                        description:
                          "Departure date in MM-DD-YYYY format, for example 05-22-2026.",
                      },
                      routeLabel: {
                        type: "string",
                        description:
                          "Human-friendly route label, for example Boston (BOS) → Miami (MIA).",
                      },
                      confirmationPrompt: {
                        type: "string",
                        description:
                          "A short confirmation question asking whether the user wants to add this route to their Skysirv watchlist.",
                      },
                    },
                    required: [
                      "origin",
                      "destination",
                      "departureDate",
                      "routeLabel",
                      "confirmationPrompt",
                    ],
                  },
                },
                {
                  type: "function",
                  name: "prepare_save_visible_flight",
                  description:
                    "Prepare a Skysirv Saved Flights action when the user asks Lucy to save a specific visible recommended flight from the current dashboard. This does not save the flight yet; Skysirv must ask the user for confirmation first.",
                  parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      origin: {
                        type: "string",
                        description:
                          "Supported origin airport code from the visible dashboard route, such as JFK.",
                      },
                      destination: {
                        type: "string",
                        description:
                          "Supported destination airport code from the visible dashboard route, such as MIA.",
                      },
                      departureDate: {
                        type: "string",
                        description:
                          "Departure date from the matching dashboard route context. YYYY-MM-DD is allowed for Saved Flights.",
                      },
                      airline: {
                        type: "string",
                        description:
                          "Airline code for the visible flight, such as AA.",
                      },
                      airlineName: {
                        type: "string",
                        description:
                          "Human-readable airline name when available, such as American Airlines.",
                      },
                      flightNumber: {
                        type: "string",
                        description:
                          "Visible flight number from recommendedFlights, such as AA2026.",
                      },
                      price: {
                        type: "number",
                        description:
                          "Visible flight price in dollars, not cents.",
                      },
                      currency: {
                        type: "string",
                        description:
                          "Flight currency, such as USD.",
                      },
                      flightLabel: {
                        type: "string",
                        description:
                          "Human-friendly flight label, such as American Airlines AA2026.",
                      },
                      confirmationPrompt: {
                        type: "string",
                        description:
                          "A short confirmation question asking whether the user wants to save this visible flight to Saved Flights.",
                      },
                    },
                    required: [
                      "origin",
                      "destination",
                      "departureDate",
                      "airline",
                      "airlineName",
                      "flightNumber",
                      "price",
                      "currency",
                      "flightLabel",
                      "confirmationPrompt",
                    ],
                  },
                },
              ],
              tool_choice: "auto",
              audio: {
                input: {
                  transcription: {
                    model: "gpt-4o-mini-transcribe",
                  },
                  turn_detection: {
                    type: "server_vad",
                    threshold: 0.9,
                    prefix_padding_ms: 200,
                    silence_duration_ms: 1600,
                  },
                },
                output: {
                  voice: LUCY_REALTIME_VOICE,
                },
              },
            },
          }),
        }
      )

      const data = await openaiResponse.json()

      if (!openaiResponse.ok) {
        request.log.error(
          { status: openaiResponse.status, data },
          "Failed to create Lucy realtime client secret"
        )

        return reply.status(502).send({
          success: false,
          error: "Lucy voice session could not be created.",
          code: "REALTIME_SESSION_FAILED",
        })
      }

      return {
        success: true,
        model: LUCY_REALTIME_MODEL,
        voice: LUCY_REALTIME_VOICE,
        plan: accountContext.planDisplayName,
        session: data,
      }
    }
  )

  app.post(
    "/flight-attendant/chat",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user as { id: string; email?: string }
      const body = request.body as FlightAttendantChatBody

      const conversation = normalizeConversation(body)

      if (!conversation.length) {
        return reply.status(400).send({
          error: "Message is required",
        })
      }

      const latestUserMessage =
        cleanMessageText(body.message) ||
        [...conversation].reverse().find((message) => message.role === "user")
          ?.content ||
        ""

      if (isClearlyOffTopic(latestUserMessage)) {
        return {
          success: true,
          model: "scope-guardrail",
          reply:
            "I’m focused on Skysirv flight intelligence, so I can’t help with that here. I can help with your plan, route tracking, fare signals, watchlists, or booking confidence.",
        }
      }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
        frontendTier: body.tier,
      })

      const dashboardRoutes = Array.isArray(body.dashboardRoutes)
        ? body.dashboardRoutes
        : []

      const visibleFlightSaveResponse = buildVisibleFlightSaveResponse({
        latestUserMessage,
        conversation,
        dashboardRoutes,
      })

      if (visibleFlightSaveResponse) {
        return {
          success: true,
          model: "lucy-visible-flight-action-router",
          reply: visibleFlightSaveResponse.reply,
          action: visibleFlightSaveResponse.action,
        }
      }

      const model = getOpenAIChatModel()

      const response = await openai.responses.create({
        model,
        input: buildOpenAIInput({
          user,
          accountContext,
          conversation,
          dashboardRoutes,
        }),
      })

      const lucyResponse = parseLucyStructuredChatResponse(response.output_text)

      return {
        success: true,
        model,
        reply: lucyResponse.reply,
        action: lucyResponse.action,
      }
    }
  )

  app.post(
    "/flight-attendant/dashboard-summary",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const user = request.user as { id: string; email?: string }

      const accountContext = await getLucyAccountContext({
        app,
        userId: user.id,
      })

      const watchlist = await getUserWatchlist(user.id)
      const model = getOpenAIIntelligenceModel()

      try {
        const response = await openai.responses.create({
          model,
          input: buildDashboardSummaryInput({
            user,
            accountContext,
            watchlist,
          }),
        })

        const summary = parseDashboardSummaryJson(response.output_text)

        return {
          success: true,
          model,
          summary,
        }
      } catch (error) {
        request.log.error(error, "Lucy dashboard summary generation failed")

        return {
          success: true,
          model,
          summary: FALLBACK_DASHBOARD_SUMMARY,
          fallback: true,
        }
      }
    }
  )
}