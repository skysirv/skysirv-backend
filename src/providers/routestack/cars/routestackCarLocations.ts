import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackCarLocationSearchInput = {
  term: string
}

export type RouteStackCarLocationSearchResponse = unknown

export async function searchRouteStackCarLocations(
  input: RouteStackCarLocationSearchInput,
): Promise<RouteStackCarLocationSearchResponse> {
  const token = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/car/locations`,
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
      `RouteStack car location search failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}