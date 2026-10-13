import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackCarSearchInput = Record<string, unknown>

export type RouteStackCarPrice = {
  currency: string
  total: number
  showTotal?: number
  rateType: string
  pay_at_booking: boolean
  mileage?: boolean
  free_cancellation?: boolean
  days?: number
  fareCode: string
  allow_cancellation?: string
}

export type RouteStackCarLocation = {
  location: string
  location_code: string
  latitude?: string
  longitude?: string
  city_center_distance?: number
  neighborhood?: string | null
  location_information?: string | null
  airport_code?: string
  airport_name?: string
}

export type RouteStackCarResult = {
  name: string
  description?: string
  type?: string
  type_name?: string
  vehicle_code?: string
  passengers?: number
  doors?: string
  hasAC?: boolean
  bags?: number
  creditCardRequired?: boolean
  hasAMT?: boolean
  heroImage?: string
  features?: string[]
  fuelType?: string
  partner?: {
    code?: string
    name?: string
    logo?: string
    phone?: string | null
  }
  pickup?: RouteStackCarLocation
  dropoff?: RouteStackCarLocation
  disclosure_required?: boolean
  driver_age_required?: boolean
  display_price?: number
  show_display_price?: number
  price_postpaid?: RouteStackCarPrice | null
  price_prepaid?: RouteStackCarPrice | null
  manual_transmission?: boolean
  mileage?: boolean
  inclusions?: string[]
}

export type RouteStackCarSearchResponse = {
  success?: boolean
  message?: string
  code?: number
  result?: {
    count?: number
    currency?: string
    currencyrate?: number
    showcurrencyrate?: number
    filters?: Record<string, unknown>
    cars?: RouteStackCarResult[]
  }
  correlationId?: string
}

export async function searchRouteStackCars(
  input: RouteStackCarSearchInput,
): Promise<RouteStackCarSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/car/search`,
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
      `RouteStack car search failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}