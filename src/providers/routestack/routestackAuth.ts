import crypto from "node:crypto"

const ROUTESTACK_BASE_URL =
  process.env.ROUTESTACK_BASE_URL ?? "https://mcp.routestack.ai"

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const ROUTESTACK_API_KEY = requireEnv("ROUTESTACK_API_KEY")
const ROUTESTACK_API_SECRET = requireEnv("ROUTESTACK_API_SECRET")

type RouteStackTokenResponse = {
  token?: string
  accessToken?: string
  expiresAt?: string
  expiresIn?: number
}

export async function getRouteStackPartnerToken(): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID()

  const hmac = crypto
    .createHmac("sha256", ROUTESTACK_API_SECRET)
    .update(`${ROUTESTACK_API_KEY}:${timestamp}:${nonce}`)
    .digest("base64url")

  const response = await fetch(
    `${ROUTESTACK_BASE_URL}/mcp/auth/partner-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: ROUTESTACK_API_KEY,
        hmac,
        timestamp,
        nonce,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `RouteStack auth failed (${response.status}): ${body}`,
    )
  }

  const data = (await response.json()) as RouteStackTokenResponse

  const token = data.token ?? data.accessToken

  if (!token) {
    throw new Error("RouteStack auth response did not include a token")
  }

  return token
}