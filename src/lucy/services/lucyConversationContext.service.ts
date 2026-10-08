import type { FastifyInstance } from "fastify"

import {
  getLucyConversationMessages,
  getRecentLucyConversations,
} from "./lucyConversation.service.js"

type LucyConversationContextMessage = {
  role: "user" | "assistant"
  content: string
  createdAt: Date
}

export type LucyRecentConversationContext = {
  conversationId: string
  title: string | null
  updatedAt: Date
  messages: LucyConversationContextMessage[]
}

function normalizeSearchTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        ![
          "the",
          "and",
          "for",
          "that",
          "this",
          "with",
          "what",
          "were",
          "was",
          "about",
          "before",
          "just",
          "talking",
          "conversation",
          "previous",
          "earlier",
          "remember",
        ].includes(token)
    )
}

function scoreConversationContext({
  query,
  title,
  messages,
}: {
  query: string
  title: string | null
  messages: LucyConversationContextMessage[]
}) {
  const queryTokens = normalizeSearchTokens(query)

  if (queryTokens.length === 0) {
    return 0
  }

  const searchableText = [
    title || "",
    ...messages.map((message) => message.content),
  ]
    .join(" ")
    .toLowerCase()

  return queryTokens.reduce(
    (score, token) =>
      searchableText.includes(token)
        ? score + 1
        : score,
    0
  )
}

export async function getRelevantRecentConversationContext({
  app,
  userId,
  currentConversationId,
  query,
  conversationLimit = 3,
}: {
  app: FastifyInstance
  userId: string
  currentConversationId?: string | null
  query: string
  conversationLimit?: number
}): Promise<LucyRecentConversationContext[]> {
  const recentConversations =
    await getRecentLucyConversations(
      app,
      userId,
      10
    )

  const candidateConversations =
    recentConversations.filter(
      (conversation) =>
        conversation.id !== currentConversationId
    )

  const contexts =
    await Promise.all(
      candidateConversations.map(
        async (conversation) => {
          const persistedMessages =
            await getLucyConversationMessages(
              app,
              userId,
              conversation.id
            )

          const messages =
            persistedMessages
              .slice(-16)
              .map((message) => ({
                role:
                  message.role === "assistant"
                    ? ("assistant" as const)
                    : ("user" as const),
                content: message.content,
                createdAt: message.created_at,
              }))

          return {
            conversationId: conversation.id,
            title: conversation.title,
            updatedAt: conversation.updated_at,
            messages,
            relevanceScore:
              scoreConversationContext({
                query,
                title: conversation.title,
                messages,
              }),
          }
        }
      )
    )

  return contexts
    .filter(
      (context) =>
        context.messages.length > 0
    )
    .sort((a, b) => {
      if (
        b.relevanceScore !==
        a.relevanceScore
      ) {
        return (
          b.relevanceScore -
          a.relevanceScore
        )
      }

      return (
        b.updatedAt.getTime() -
        a.updatedAt.getTime()
      )
    })
    .slice(0, conversationLimit)
    .map(
      ({
        relevanceScore: _relevanceScore,
        ...context
      }) => context
    )
}