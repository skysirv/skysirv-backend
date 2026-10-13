import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackHotelRevalidateInput = {
  hotelId: string
  recommendationId: string
  token: string
  correlationId?: string
  publishedRate?: number
}

export type RouteStackCancellationRule = {
  start: string
  end: string
  estimatedValue: number
  value: number
  valueType: string
}

export type RouteStackCancellationPolicy = {
  rules: RouteStackCancellationRule[]
  text?: string
}

export type RouteStackRevalidatedRoom = {
  id: string
  name: string
  description?: string | null
  beds?: Array<{
    count: number
    type: string
  }>
  smokingAllowed?: boolean
  occupancies?: Array<{
    roomId: string
    numOfAdults: number
    numOfChildren: number
    childAges: number[]
  }>
}

export type RouteStackRevalidatedRate = {
  id: string
  ourprice: number
  totalRate: number
  baseRate: number
  publishedRate: number
  show_published_price?: number
  boardBasis?: {
    type?: string
    description?: string | null
    displayText?: string | null
  }
  refundability?: string
  cancellationPolicies?: RouteStackCancellationPolicy[]
  occupancies?: Array<{
    roomId: string
    numOfAdults: string
    numOfChildren: string
    childAges: number[]
  }>
  providerId?: string
  providerName?: string
}

export type RouteStackHotelRevalidateResponse = {
  success: boolean
  message?: string
  code?: number
  result?: {
    token: string
    currency: string
    hotelId: string
    ourprice: number
    totalRate: number
    taxes?: number
    fees?: number
    publicprice?: number
    saving?: number
    savingratio?: number
    margin?: number
    margin_perc?: number
    merchantfee?: number
    merchantfee_perc?: number
    baseprice?: number
    cancellationPolicies?: RouteStackCancellationPolicy[]
    room?: RouteStackRevalidatedRoom[]
    rate?: RouteStackRevalidatedRate[]
    [key: string]: unknown
  }
}

export async function revalidateRouteStackHotel(
  input: RouteStackHotelRevalidateInput,
): Promise<RouteStackHotelRevalidateResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/hotel/revalidate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotelId: input.hotelId,
        recommendationId: input.recommendationId,
        token: input.token,
        correlationId: input.correlationId,
        publishedRate: input.publishedRate,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack hotel revalidation failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}