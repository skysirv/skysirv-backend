import { type FastifyInstance } from "fastify"

type LucyMemoryRetrievalMessage = {
  role: "user" | "assistant"
  content: string
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
])

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(" ")
        .filter(
          (token) =>
            token.length >= 3 &&
            !STOP_WORDS.has(token)
        )
    )
  )
}

function getLatestUserMessage(
  conversation: LucyMemoryRetrievalMessage[]
) {
  for (
    let index = conversation.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message = conversation[index]

    if (message.role === "user") {
      return message.content
    }
  }

  return ""
}

function isBroadMemoryQuestion(value: string) {
  const normalized = normalizeText(value)

  return (
    normalized.includes("what do you remember about me") ||
    normalized.includes("what do you know about me") ||
    normalized.includes("what have you saved about me") ||
    normalized.includes("show my memories") ||
    normalized.includes("show me my memories") ||
    normalized.includes("my saved preferences")
  )
}

export async function getRelevantLucyMemories({
  app,
  userId,
  conversation,
  limit = 8,
}: {
  app: FastifyInstance
  userId: string
  conversation: LucyMemoryRetrievalMessage[]
  limit?: number
}) {
  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 1),
    12
  )

  const memories = await app.db
    .selectFrom("user_lucy_memories as m")
    .leftJoin(
      "user_lucy_memory_subjects as s",
      "s.id",
      "m.subject_id"
    )
    .select([
      "m.id as id",
      "m.subject_id as subject_id",
      "m.memory_type as memory_type",
      "m.memory_key as memory_key",
      "m.memory_text as memory_text",
      "m.memory_value_json as memory_value_json",
      "m.confidence as confidence",
      "m.source as source",
      "m.channel as channel",
      "m.source_conversation_id as source_conversation_id",
      "m.source_message_id as source_message_id",
      "m.status as status",
      "m.last_used_at as last_used_at",
      "m.reinforcement_count as reinforcement_count",
      "m.last_reinforced_at as last_reinforced_at",
      "m.usage_count as usage_count",
      "m.created_at as created_at",
      "m.updated_at as updated_at",
      "s.subject_type as subject_type",
      "s.subject_key as subject_key",
      "s.display_name as subject_display_name",
      "s.relationship_label as subject_relationship_label",
      "s.aliases as subject_aliases",
    ])
    .where("m.user_id", "=", userId)
    .where("m.status", "=", "active")
    .orderBy("m.updated_at", "desc")
    .limit(200)
    .execute()

  if (!memories.length) {
    return []
  }

  const latestUserMessage =
    getLatestUserMessage(conversation)

  if (isBroadMemoryQuestion(latestUserMessage)) {
    return memories
      .filter(
        (memory) =>
          memory.subject_type === "self" ||
          !memory.subject_id
      )
      .slice(0, safeLimit)
  }

  const recentConversation = conversation
    .slice(-6)
    .map((message) => message.content)
    .join(" ")

  const latestTokens = tokenize(latestUserMessage)
  const recentTokens = tokenize(recentConversation)

  if (
    !latestTokens.length &&
    !recentTokens.length
  ) {
    return []
  }

  const ranked = memories
    .map((memory) => {
      const memoryKeyTokens = tokenize(
        memory.memory_key.replace(/_/g, " ")
      )

      const memoryTextTokens = tokenize(
        memory.memory_text
      )

      const memoryValueText =
        memory.memory_value_json == null
          ? ""
          : JSON.stringify(
            memory.memory_value_json
          )

      const memoryValueTokens = tokenize(
        memoryValueText
      )

      const memoryTypeTokens = tokenize(
        memory.memory_type.replace(/_/g, " ")
      )

      const subjectAliasText =
        Array.isArray(memory.subject_aliases)
          ? memory.subject_aliases
            .filter(
              (value): value is string =>
                typeof value === "string"
            )
            .join(" ")
          : ""

      const subjectTokens = tokenize(
        [
          memory.subject_type ?? "",
          memory.subject_key ?? "",
          memory.subject_display_name ?? "",
          memory.subject_relationship_label ?? "",
          subjectAliasText,
        ].join(" ")
      )

      const memoryTokenSet = new Set([
        ...memoryKeyTokens,
        ...memoryTextTokens,
        ...memoryValueTokens,
        ...memoryTypeTokens,
        ...subjectTokens,
      ])

      const memoryKeyTokenSet =
        new Set(memoryKeyTokens)

      const subjectTokenSet =
        new Set(subjectTokens)

      let score = 0

      for (const token of latestTokens) {
        if (subjectTokenSet.has(token)) {
          score += 6
          continue
        }

        if (memoryKeyTokenSet.has(token)) {
          score += 4
          continue
        }

        if (memoryTokenSet.has(token)) {
          score += 3
        }
      }

      for (const token of recentTokens) {
        if (latestTokens.includes(token)) {
          continue
        }

        if (subjectTokenSet.has(token)) {
          score += 3
          continue
        }

        if (memoryKeyTokenSet.has(token)) {
          score += 2
          continue
        }

        if (memoryTokenSet.has(token)) {
          score += 1
        }
      }

      if (score > 0) {
        if (memory.subject_type === "self") {
          score += 0.35
        }

        if (memory.confidence === "confirmed") {
          score += 0.5
        }

        if (
          memory.source ===
          "explicit_user_request" ||
          memory.source ===
          "explicit_user_statement" ||
          memory.source === "user_confirmed"
        ) {
          score += 0.25
        }

        const reinforcementBoost = Math.min(
          Math.log1p(memory.reinforcement_count) *
          0.35,
          1.5
        )

        const usageBoost = Math.min(
          Math.log1p(memory.usage_count) * 0.1,
          0.5
        )

        score += reinforcementBoost
        score += usageBoost
      }

      return {
        memory,
        score,
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return (
        new Date(
          right.memory.updated_at
        ).getTime() -
        new Date(
          left.memory.updated_at
        ).getTime()
      )
    })
    .slice(0, safeLimit)

  return ranked.map((item) => item.memory)
}