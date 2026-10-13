import { getRouteStackPartnerToken } from "../routestackAuth.js"
import type { RouteStackFlightItinerary } from "./routestackFlights.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackFlightCheckoutInput = {
  flight: RouteStackFlightItinerary
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children: number
  infants: number
  currency?: string
  correlationId?: string
  searchFilterObj?: Record<string, unknown> | string
  sessionId?: string
  trip?: string
  type?: string
  tripType?: string
  exchangeRate?: number
  portalUrl?: string
  routestackExternalUserid?: string
  routestackMetadata?: Record<string, unknown>
}

export type RouteStackFlightCheckoutResponse = {
  success: boolean
  checkoutMode?: "deeplink" | "acp"
  url?: string
  session?: {
    id: string
    status: string
    checkout_mode: string
    currency: string
    expires_at?: string
    details_complete?: boolean
    links?: {
      self: string
      complete: string
      cancel: string
    }
    [key: string]: unknown
  }
}

export async function getRouteStackFlightCheckout(
  input: RouteStackFlightCheckoutInput,
): Promise<RouteStackFlightCheckoutResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/flight/get-payment-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flight: input.flight,
        origin: input.origin,
        destination: input.destination,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: input.adults,
        children: input.children,
        infants: input.infants,
        currency: input.currency,
        correlationId: input.correlationId,
        searchFilterObj: input.searchFilterObj,
        sessionId: input.sessionId,
        trip: input.trip,
        type: input.type,
        tripType: input.tripType,
        exchangeRate: input.exchangeRate,
        portalUrl: input.portalUrl,
        routestack_external_userid: input.routestackExternalUserid,
        routestack_metadata: input.routestackMetadata,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack flight checkout failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as RouteStackFlightCheckoutResponse
}