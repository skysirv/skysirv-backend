import { getRouteStackPartnerToken } from "../routestackAuth.js"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

export type RouteStackFlightRevalidateInput = {
  fareSourceCode: string
  searchListPrice?: Record<string, unknown>
  searchFilterObj?: Record<string, unknown>
}

export type RouteStackFlightRevalidateResponse = unknown

export async function revalidateRouteStackFlight(
  input: RouteStackFlightRevalidateInput,
): Promise<RouteStackFlightRevalidateResponse> {
  const partnerToken = await getRouteStackPartnerToken()

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/flight/revalidate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fareSourceCode: input.fareSourceCode,
        searchListPrice: input.searchListPrice,
        searchFilterObj: input.searchFilterObj,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack flight revalidation failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}