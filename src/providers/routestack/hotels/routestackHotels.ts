import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackHotelRoom = {
  adults: number
  children?: number
  childAges?: number[]
}

export type RouteStackHotelSearchInput = {
  city: string
  destinationId?: string
  lat?: number
  long?: number
  checkIn: string
  checkOut: string
  roomCount: number
  rooms: RouteStackHotelRoom[]
}

export type RouteStackHotelFacility = {
  name: string
  id: number
  groupId: string
}

export type RouteStackHotelOptions = {
  freeBreakfast: boolean
  halfBoard: boolean
  fullBoard: boolean
  refundable: boolean
  freeCancellation: boolean
}

export type RouteStackHotelAddress = {
  line1: string
  city?: {
    name: string
  }
  country?: {
    code: string
    name: string
  }
}

export type RouteStackHotelResult = {
  id: string
  name: string
  providerName: string
  starRating: number
  ourprice: number
  baseprice: number
  publishedRate: number
  saving: number
  savingratio: number
  facilities: RouteStackHotelFacility[]
  distance: number
  distancekm: number
  heroImage: string | null
  chain: string | null
  payAtHotel: boolean
  ratetype: string
  options: RouteStackHotelOptions
  contact?: {
    address?: RouteStackHotelAddress
  }
  reviews: unknown
  mainamenity: string[]
}

export type RouteStackHotelSearchResponse = {
  success?: boolean
  message?: string
  code?: number
  result?: {
    status?: string
    nextResultsKey?: string | null
    count?: number
    token?: string | null
    correlationId?: string | null
    currency?: string
    result?: RouteStackHotelResult[]
  }
  searchIncomplete?: boolean
}

export async function searchRouteStackHotels(
  input: RouteStackHotelSearchInput,
): Promise<RouteStackHotelSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/hotel/search-hotels`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        city: input.city,
        destinationId: input.destinationId,
        lat: input.lat,
        long: input.long,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        roomCount: input.roomCount,
        rooms: input.rooms,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack hotel search failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as RouteStackHotelSearchResponse
}