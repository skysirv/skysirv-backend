export type FlightAttendantRole = "user" | "assistant"

export type FlightAttendantIncomingMessage = {
  role?: FlightAttendantRole
  content?: string
  text?: string
}

export type FlightAttendantDashboardRouteContext = {
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

export type FlightAttendantChatBody = {
  message?: string
  messages?: FlightAttendantIncomingMessage[]
  tier?: "free" | "pro" | "business"
  dashboardRoutes?: FlightAttendantDashboardRouteContext[]
}

export type FlightAttendantPublicChatBody = {
  message?: string
  messages?: FlightAttendantIncomingMessage[]
  surface?: "homepage_public"
}