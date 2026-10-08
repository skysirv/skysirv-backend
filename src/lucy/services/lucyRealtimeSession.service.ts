import { type FlightAttendantDashboardRouteContext } from "../models/flightAttendant.types.js"
import {
  LUCY_REALTIME_MODEL,
  LUCY_REALTIME_VOICE,
} from "../models/lucyRealtime.config.js"
import { buildLucyRealtimeInstructions } from "../prompts/features/lucyRealtime.prompt.js"
import { type getLucyAccountContext } from "./lucyAccountContext.service.js"
import { getLucyRealtimeTools } from "./lucyRealtimeTools.service.js"

export async function createLucyRealtimeClientSecret({
  userId,
  accountContext,
  watchlistForRealtime,
  conversationHistory,
  clientLocalDateTime,
  clientTimeZone,
}: {
  userId: string
  accountContext: Awaited<ReturnType<typeof getLucyAccountContext>>
  watchlistForRealtime: FlightAttendantDashboardRouteContext[]
  conversationHistory: Array<{
    role: "user" | "assistant"
    content: string
  }>
  clientLocalDateTime: string | null
  clientTimeZone: string | null
}) {
  const openaiResponse = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": userId,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: LUCY_REALTIME_MODEL,
          instructions: buildLucyRealtimeInstructions(
            accountContext,
            watchlistForRealtime,
            conversationHistory,
            clientLocalDateTime,
            clientTimeZone,
          ),
          tools: getLucyRealtimeTools(),
          tool_choice: "auto",
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.9,
                prefix_padding_ms: 200,
                silence_duration_ms: 1600,
                create_response: true,
                interrupt_response: true,
              },
            },
            output: {
              voice: LUCY_REALTIME_VOICE,
            },
          },
        },
      }),
    },
  )

  const data = await openaiResponse.json()

  return {
    ok: openaiResponse.ok,
    status: openaiResponse.status,
    data,
  }
}