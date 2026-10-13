import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackFlightSearchInput = Record<string, unknown>

export type RouteStackFlightBaggage = {
  type: string
  value: string
}

export type RouteStackFlightSegment = {
  triptime?: number
  airline?: string
  cabin?: string
  departure?: string
  departurelocation?: string
  departairport?: string
  arrival?: string
  arrivallocation?: string
  arrivalairport?: string
  departureTime?: string
  arrivalTime?: string
  stops?: number
  flightCode?: string
  flightNumber?: string
  fareFamily?: string
  remainingSeats?: number
  legindicator?: number
  checkInBaggage?: RouteStackFlightBaggage[]
  cabinBaggage?: RouteStackFlightBaggage[]
}

export type RouteStackFlightPenalty = {
  paxType?: string
  refundPenaltyAmount?: string
  refundAllowed?: boolean
  currency?: string
  changePenaltyAmount?: string
  changeAllowed?: boolean
}

export type RouteStackFlightItinerary = {
  stops?: number
  flights?: RouteStackFlightSegment[]
  exchangeTime?: string
  ticketingTime?: string
  voidTime?: string
  fareSourceCode: string
  sessionId?: string | null
  paxType?: string
  quantity?: number
  baseFare?: number
  totalFare?: number
  ourprice?: number
  showOurprice?: number
  taxes?: number
  margin?: number
  merchantfee?: number
  marginPerc?: number
  merchantFeesPerc?: number
  penaltydetails?: RouteStackFlightPenalty[]
}

export type RouteStackFlightFilters = {
  classes?: string[]
  airline?: string[]
  stops?: number[]
  minprice?: number
  maxprice?: number
  refundability?: string[]
  timeslots?: {
    start?: number
    end?: number
  }
  maxTotalDuration?: number
  minTotalDuration?: number
  minLayoverDuration?: number
  maxLayoverDuration?: number
}

export type RouteStackFlightSearchResponse = {
  success?: boolean
  message?: string | null
  code?: number | string
  result?: RouteStackFlightItinerary[]
  currency?: string
  currencyrate?: number
  membercurrencyrate?: number
  showcurrencyrate?: number
  filters?: RouteStackFlightFilters
  correlationId?: string
  alphaSessionId?: string
  searchFilterObj?: Record<string, unknown> | string
}

export async function searchRouteStackFlights(
  input: RouteStackFlightSearchInput,
): Promise<RouteStackFlightSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/flight/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack flight search failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}