import { getRouteStackPartnerToken } from "../routestackAuth.js"
import type { RouteStackHotelRoom } from "./routestackHotels.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackHotelCheckoutInput = {
  hotelId: string
  roomId: string
  recommendationId: string
  token: string
  correlationId?: string
  checkIn: string
  checkOut: string
  rooms: RouteStackHotelRoom[]
  hotelName?: string
  priceCheckResult?: Record<string, unknown>
  portalUrl?: string
  routestackExternalUserid?: string
  routestackMetadata?: Record<string, unknown>
}

export type RouteStackHotelCheckoutResponse = {
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

export async function getRouteStackHotelCheckout(
  input: RouteStackHotelCheckoutInput,
): Promise<RouteStackHotelCheckoutResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/hotel/get-payment-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotelId: input.hotelId,
        roomId: input.roomId,
        recommendationId: input.recommendationId,
        token: input.token,
        correlationId: input.correlationId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms: input.rooms,
        hotelName: input.hotelName,
        priceCheckResult: input.priceCheckResult,
        portalUrl: input.portalUrl,
        routestack_external_userid: input.routestackExternalUserid,
        routestack_metadata: input.routestackMetadata,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack hotel checkout failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as RouteStackHotelCheckoutResponse
}