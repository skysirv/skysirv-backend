export const LUCY_SCOPE_REDIRECT_REPLY =
  "I’m here for Skysirv travel support, so I can’t help with that one here. I can help with destinations, flights, stays, cars, cruises, rail, itineraries, trip planning, saved travel, or Skysirv intelligence."

const TRAVEL_SIGNALS = [
  "flight",
  "flights",
  "fare",
  "fares",
  "airfare",
  "route",
  "routes",
  "watchlist",
  "saved flight",
  "saved flights",
  "airport",
  "airports",
  "airline",
  "airlines",
  "ticket",
  "tickets",
  "trip",
  "trips",
  "travel",
  "traveler",
  "travelling",
  "traveling",
  "vacation",
  "holiday",
  "destination",
  "destinations",
  "itinerary",
  "itineraries",
  "layover",
  "layovers",
  "connection",
  "connections",
  "terminal",
  "terminals",
  "gate",
  "gates",
  "lounge",
  "lounges",
  "baggage",
  "bags",
  "carry-on",
  "carry on",
  "packing",
  "passport",
  "visa",
  "customs",
  "immigration",
  "hotel",
  "hotels",
  "accommodation",
  "accommodations",
  "resort",
  "resorts",
  "rental car",
  "rental cars",
  "car rental",
  "car rentals",
  "ground transportation",
  "transfer",
  "transfers",
  "cruise",
  "cruises",
  "rail",
  "railway",
  "train",
  "trains",
  "tour",
  "tours",
  "attraction",
  "attractions",
  "family trip",
  "business trip",
  "booking",
  "reservation",
  "reservations",
  "skyscore",
]

const OFF_TOPIC_SIGNALS = [
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function containsSignal(message: string, signal: string) {
  const escapedSignal = escapeRegExp(signal)

  return new RegExp(
    `(^|[^a-z0-9])${escapedSignal}([^a-z0-9]|$)`,
    "i",
  ).test(message)
}

export function isClearlyOffTopic(message: string) {
  const normalized = message.toLowerCase()

  const hasTravelSignal = TRAVEL_SIGNALS.some((signal) =>
    containsSignal(normalized, signal),
  )

  const hasOffTopicSignal = OFF_TOPIC_SIGNALS.some((signal) =>
    containsSignal(normalized, signal),
  )

  return hasOffTopicSignal && !hasTravelSignal
}