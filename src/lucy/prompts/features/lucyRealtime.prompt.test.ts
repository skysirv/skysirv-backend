import { describe, expect, it } from "vitest"
import { buildLucyRealtimeInstructions } from "./lucyRealtime.prompt.js"

describe("Lucy realtime active-thread provenance", () => {
  const accountContext = {
    planDisplayName: "Pro",
    preferredAirports: [],
    preferredRoutes: [],
    savedFlights: [],
  } as any

  it("preserves the exact latest traveler text and distinguishes it from assistant replies", () => {
    const instructions = buildLucyRealtimeInstructions(
      accountContext,
      [],
      [
        { role: "user", content: "I'm thinking about visiting Japan next spring." },
        { role: "assistant", content: "Would you prefer Tokyo or Kyoto?" },
      ],
    )

    expect(instructions).toContain('"I\'m thinking about visiting Japan next spring."')
    expect(instructions).toContain("[1] Traveler: I'm thinking about visiting Japan next spring.")
    expect(instructions).toContain("[2] Lucy: Would you prefer Tokyo or Kyoto?")
    expect(instructions).toContain("Never attribute an assistant's words to the traveler")
    expect(instructions).toContain('Never use retrieve_recent_conversation_context to answer what the traveler "just" said')
  })

  it("does not invent a latest traveler message when the thread is empty", () => {
    const instructions = buildLucyRealtimeInstructions(accountContext, [], [])
    expect(instructions).toContain("Latest persisted traveler message in THIS active thread (not a previous thread):\nnull")
  })
})
