import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackHotelDestinationSearchInput = {
  query: string
}

export type RouteStackHotelDestinationSearchResponse = unknown

export async function searchRouteStackHotelDestinations(
  input: RouteStackHotelDestinationSearchInput,
): Promise<RouteStackHotelDestinationSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/hotel/search-destinations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack hotel destination search failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}