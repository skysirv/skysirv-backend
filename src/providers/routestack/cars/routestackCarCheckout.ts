import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackCarCheckoutInput = {
  car: Record<string, unknown>
  pickup: string
  dropoff: string
  pickupDate: string
  dropoffDate: string
  pickupTime?: string
  dropoffTime?: string
  correlationId?: string
  portalUrl?: string
  routestackExternalUserid?: string
  routestackMetadata?: Record<string, unknown>
}

export type RouteStackCarCheckoutResponse = {
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

export async function getRouteStackCarCheckout(
  input: RouteStackCarCheckoutInput,
): Promise<RouteStackCarCheckoutResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/car/get-payment-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        car: input.car,
        pickup: input.pickup,
        dropoff: input.dropoff,
        pickupDate: input.pickupDate,
        dropoffDate: input.dropoffDate,
        pickupTime: input.pickupTime,
        dropoffTime: input.dropoffTime,
        correlationId: input.correlationId,
        portalUrl: input.portalUrl,
        routestack_external_userid: input.routestackExternalUserid,
        routestack_metadata: input.routestackMetadata,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack car checkout failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as RouteStackCarCheckoutResponse
}