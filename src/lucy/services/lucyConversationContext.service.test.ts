import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getRecentLucyConversations: vi.fn(),
  getLucyConversationMessages: vi.fn(),
}))

vi.mock("./lucyConversation.service.js", () => mocks)

import { getRelevantRecentConversationContext } from "./lucyConversationContext.service.js"

const now = new Date("2026-10-13T14:00:00Z")
const conversations = [
  { id: "active", title: "Japan spring", updated_at: now, updatedAt: now },
  { id: "old-tokyo", title: "Tokyo itinerary", updated_at: now, updatedAt: now },
  { id: "old-paris", title: "Paris planning", updated_at: now, updatedAt: now },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getRecentLucyConversations.mockResolvedValue(conversations)
  mocks.getLucyConversationMessages.mockImplementation(async (_app, _userId, id) => {
    const content = id === "old-tokyo"
      ? "I'm planning seven days in Tokyo."
      : id === "old-paris"
        ? "I'm visiting Paris in autumn."
        : "I'm thinking about visiting Japan next spring."
    return [{ role: "user", content, created_at: now }]
  })
})

describe("Lucy historical conversation retrieval", () => {
  it("excludes the active thread and unrelated zero-score threads", async () => {
    const results = await getRelevantRecentConversationContext({
      app: {} as any,
      userId: "test-user",
      currentConversationId: "active",
      query: "Tokyo",
    })
    expect(results.map((result) => result.conversationId)).toEqual(["old-tokyo"])
  })

  it("permits recency-based retrieval for an unspecific previous-thread request", async () => {
    const results = await getRelevantRecentConversationContext({
      app: {} as any,
      userId: "test-user",
      currentConversationId: "active",
      query: "What were we just talking about before?",
    })
    expect(results).toHaveLength(2)
    expect(results.every((result) => result.conversationId !== "active")).toBe(true)
  })
})
