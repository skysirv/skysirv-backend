import type {
  LucyMemorySubjectCandidate,
} from "./lucyMemory.types.js"

export type LucyWatchlistAction = {
  type: "add_watchlist_route"
  status: "needs_confirmation"
  origin: string
  destination: string
  departureDate: string
  routeLabel: string
  confirmationPrompt: string
}

export type LucyPreferredAirportsAction = {
  type: "save_preferred_airports"
  status: "needs_confirmation"
  airportCodes: string[]
  airportLabels: string[]
  confirmationPrompt: string
}

export type LucyPreferredRouteAction = {
  type: "save_preferred_route"
  status: "needs_confirmation"
  origin: string
  destination: string
  routeLabel: string
  confirmationPrompt: string
}

export type LucySaveFirstNameAction = {
  type: "save_first_name"
  status: "needs_confirmation"
  firstName: string
  confirmationPrompt: string
}

export type LucySaveVisibleFlightAction = {
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

export type LucySaveMemoryAction = {
  type: "save_lucy_memory"
  status: "needs_confirmation"
  subject?: LucyMemorySubjectCandidate
  memoryType: string
  memoryKey: string
  memoryText: string
  memoryValueJson: unknown | null
  confirmationPrompt: string
}

export type LucySearchFlightsAction = {
  type: "search_flights"
  status: "ready"
  tripType: "one_way" | "round_trip"
  origin: string
  destination: string
  departureDate: string
  returnDate: string | null
  adults: number
  children: number
  infants: number
  cabinClass:
  | "economy"
  | "premium_economy"
  | "business"
  | "first"
  maxConnections: number
  airlineIataCode: string | null
  departurePeriod:
  | "early_morning"
  | "morning"
  | "afternoon"
  | "evening"
  | "any"
  maxResults: number
}

export type LucySearchHotelsAction = {
  type: "search_hotels"
  status: "ready"
  destination: string
  checkInDate: string
  checkOutDate: string
  adults: number
  childAges: number[]
  rooms: number
  freeCancellationOnly: boolean
  maxResults: number
}

export type LucySearchCarsAction = {
  type: "search_cars"
  status: "ready"
  pickupLocation: string
  dropoffLocation: string
  pickupDate: string
  dropoffDate: string
  pickupTime: string
  dropoffTime: string
  driverAge: number | null
  maxResults: number
}

export type LucySuggestedAction =
  | LucySearchFlightsAction
  | LucySearchHotelsAction
  | LucySearchCarsAction
  | LucyWatchlistAction
  | LucyPreferredAirportsAction
  | LucyPreferredRouteAction
  | LucySaveFirstNameAction
  | LucySaveVisibleFlightAction
  | LucySaveMemoryAction


export type LucyStructuredChatResponse = {
  reply: string
  action: LucySuggestedAction | null
  memoryActions?: LucySaveMemoryAction[]
}