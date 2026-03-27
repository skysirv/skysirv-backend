import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID)

export interface GoogleUserPayload {
  provider: 'google'
  provider_id: string
  email: string
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleUserPayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  })

  const payload = ticket.getPayload()

  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google token payload')
  }

  return {
    provider: 'google',
    provider_id: payload.sub,
    email: payload.email,
  }
}