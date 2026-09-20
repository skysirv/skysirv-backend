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
  memoryType: string
  memoryKey: string
  memoryText: string
  memoryValueJson: unknown | null
  confirmationPrompt: string
}

export type LucySuggestedAction =
  | LucyWatchlistAction
  | LucyPreferredAirportsAction
  | LucyPreferredRouteAction
  | LucySaveFirstNameAction
  | LucySaveVisibleFlightAction
  | LucySaveMemoryAction

export type LucyStructuredChatResponse = {
  reply: string
  action: LucySuggestedAction | null
}