import { getRouteStackPartnerToken } from "../routestackAuth.js"
import type { RouteStackHotelRoom } from "./routestackHotels.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackHotelDetailsAndRatesInput = {
  hotelId: string
  token: string
  correlationId?: string
  checkIn: string
  checkOut: string
  rooms: RouteStackHotelRoom[]
  hotelName?: string
  publishedRate?: number
  contentType?: string
}

export type RouteStackHotelRate = {
  id: string
  name: string
  description?: string | null
  recommendationId: string
  rateid?: string
  availability?: string
  ourprice: number
  publishedRate?: number
  baseRate?: number
  totalRate?: number
  refundable?: boolean
  refundability?: string
  boardBasis?: {
    type?: string
    description?: string | null
    displayText?: string | null
  }
  beds?: Array<{
    type: string
    count: number | string
  }>
  smokingAllowed?: boolean
  facilities?: Array<{
    groupName?: string | null
    name: string
  }>
  occupancies?: Array<{
    roomId: string
    stdRoomId?: number
    numOfAdults: number
    numOfChildren: number
  }>
}

export type RouteStackHotelRoomType = {
  id: number
  name: string
  type?: string
  facilities?: Array<{
    name: string
  }>
  maxGuestAllowed?: string
  maxAdultAllowed?: string
  maxChildrenAllowed?: string
  beds?: Array<{
    type: string
    count: number | string
  }>
  rooms?: RouteStackHotelRate[]
}

export type RouteStackHotelDetailsAndRatesResponse = {
  success?: boolean
  message?: string
  code?: number
  result?: {
    result?: RouteStackHotelRoomType[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function getRouteStackHotelDetailsAndRates(
  input: RouteStackHotelDetailsAndRatesInput,
): Promise<RouteStackHotelDetailsAndRatesResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/hotel/get-hotel-details-and-rates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hotelId: input.hotelId,
        token: input.token,
        correlationId: input.correlationId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms: input.rooms,
        hotelName: input.hotelName,
        publishedRate: input.publishedRate,
        contentType: input.contentType,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack hotel details/rates failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}