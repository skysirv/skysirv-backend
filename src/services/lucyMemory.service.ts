import crypto from "crypto"
import { FastifyInstance } from "fastify"
import { sql } from "kysely"
import {
  isLucyMemoryConfidence,
  isLucyMemorySource,
  isLucyMemoryType,
  type LucyMemoryConfidence,
  type LucyMemorySource,
  type LucyMemoryType,
} from "../lucy/models/lucyMemory.types.js"

import {
  getOrCreateSelfLucyMemorySubject,
} from "../lucy/services/lucyMemorySubject.service.js"

export type SaveLucyMemoryInput = {
  userId: string
  subjectId?: string | null
  memoryType: string
  memoryKey: string
  memoryText: string
  memoryValueJson?: unknown | null
  confidence?: string
  source?: string
  channel?: string
  sourceConversationId?: string | null
  sourceMessageId?: string | null
}

function cleanMemoryType(
  value: string
): LucyMemoryType {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")

  if (isLucyMemoryType(normalized)) {
    return normalized
  }

  return "general_travel_note"
}

function cleanMemoryConfidence(
  value: string | undefined
): LucyMemoryConfidence {
  const normalized = (value || "")
    .trim()
    .toLowerCase()

  if (isLucyMemoryConfidence(normalized)) {
    return normalized
  }

  return "confirmed"
}

function cleanMemorySource(
  value: string | undefined
): LucyMemorySource {
  const normalized = (value || "")
    .trim()
    .toLowerCase()

  if (isLucyMemorySource(normalized)) {
    return normalized
  }

  return "user_confirmed"
}

function cleanMemoryKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (!normalized) return ""

  return normalized.slice(0, 120)
}

function cleanMemoryText(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 500)
}

export async function getActiveLucyMemories(
  app: FastifyInstance,
  userId: string
) {
  return app.db
    .selectFrom("user_lucy_memories")
    .select([
      "id",
      "memory_type",
      "memory_key",
      "memory_text",
      "memory_value_json",
      "confidence",
      "source",
      "channel",
      "source_conversation_id",
      "source_message_id",
      "status",
      "last_used_at",
      "reinforcement_count",
      "last_reinforced_at",
      "usage_count",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .orderBy("updated_at", "desc")
    .limit(50)
    .execute()
}

export async function saveLucyMemory(
  app: FastifyInstance,
  input: SaveLucyMemoryInput
) {
  const memoryType = cleanMemoryType(input.memoryType)
  const memoryKey = cleanMemoryKey(input.memoryKey)
  const memoryText = cleanMemoryText(input.memoryText)

  const confidence =
    cleanMemoryConfidence(input.confidence)

  const source =
    cleanMemorySource(input.source)

  if (!memoryKey) {
    throw new Error("Memory key is required")
  }

  if (!memoryText) {
    throw new Error("Memory text is required")
  }

  const now = new Date()

  let subjectId = input.subjectId ?? null

  if (!subjectId) {
    const subject =
      await getOrCreateSelfLucyMemorySubject(
        app,
        input.userId
      )

    subjectId = subject.id
  }

  return app.db
    .insertInto("user_lucy_memories")
    .values({
      id: crypto.randomUUID(),
      user_id: input.userId,
      subject_id: subjectId,
      memory_type: memoryType,
      memory_key: memoryKey,
      memory_text: memoryText,
      memory_value_json: input.memoryValueJson ?? null,
      confidence,
      source,
      channel: input.channel || "unknown",
      source_conversation_id:
        input.sourceConversationId ?? null,
      source_message_id:
        input.sourceMessageId ?? null,
      status: "active",
      last_used_at: null,
      reinforcement_count: 0,
      last_reinforced_at: null,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns([
          "user_id",
          "subject_id",
          "memory_type",
          "memory_key",
        ])
        .doUpdateSet({
          memory_text: memoryText,
          memory_value_json: input.memoryValueJson ?? null,
          confidence,
          source,
          channel: input.channel || "unknown",
          source_conversation_id:
            input.sourceConversationId ?? null,
          source_message_id:
            input.sourceMessageId ?? null,
          status: "active",
          updated_at: now,
        })
    )
    .returning([
      "id",
      "user_id",
      "memory_type",
      "memory_key",
      "memory_text",
      "memory_value_json",
      "confidence",
      "source",
      "channel",
      "source_conversation_id",
      "source_message_id",
      "status",
      "last_used_at",
      "reinforcement_count",
      "last_reinforced_at",
      "usage_count",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirstOrThrow()
}

export async function markLucyMemoriesUsed(
  app: FastifyInstance,
  userId: string,
  memoryIds: string[]
) {
  const uniqueMemoryIds = Array.from(
    new Set(
      memoryIds.filter(
        (memoryId) =>
          typeof memoryId === "string" &&
          memoryId.trim()
      )
    )
  )

  if (!uniqueMemoryIds.length) return

  await app.db
    .updateTable("user_lucy_memories")
    .set({
      last_used_at: new Date(),
      usage_count: sql<number>`usage_count + 1`,
    })
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .where("id", "in", uniqueMemoryIds)
    .execute()
}

export async function deactivateLucyMemory({
  app,
  userId,
  memoryId,
}: {
  app: FastifyInstance
  userId: string
  memoryId: string
}) {
  return app.db
    .updateTable("user_lucy_memories")
    .set({
      status: "deleted",
      updated_at: new Date(),
    })
    .where("id", "=", memoryId)
    .where("user_id", "=", userId)
    .returning([
      "id",
      "memory_type",
      "memory_key",
      "memory_text",
      "status",
      "updated_at",
    ])
    .executeTakeFirst()
}