import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackFlightLocationSearchInput = {
  term: string
}

export type RouteStackFlightLocationSearchResponse = unknown

export async function searchRouteStackFlightLocations(
  input: RouteStackFlightLocationSearchInput,
): Promise<RouteStackFlightLocationSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/flight/locations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        term: input.term,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack flight location search failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}