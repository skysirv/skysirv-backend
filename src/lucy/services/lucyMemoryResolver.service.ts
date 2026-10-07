import { type FastifyInstance } from "fastify"

import {
  isLucyMemoryType,
  type LucyMemoryCandidate,
  type LucyMemoryType,
} from "../models/lucyMemory.types.js"

import {
  resolveLucyMemorySubject,
} from "./lucyMemorySubject.service.js"

export type LucyMemoryResolution =
  | {
    decision: "create"
    existingMemoryId: null
    subjectId: string
    candidate: LucyMemoryCandidate
  }
  | {
    decision: "reinforce"
    existingMemoryId: string
    subjectId: string
    candidate: LucyMemoryCandidate
  }
  | {
    decision: "update"
    existingMemoryId: string
    subjectId: string
    candidate: LucyMemoryCandidate
  }

function normalizeMemoryKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)
}

function normalizeMemoryText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500)
}

function normalizeMemoryType(
  value: LucyMemoryType
): LucyMemoryType {
  if (isLucyMemoryType(value)) {
    return value
  }

  return "general_travel_note"
}

export async function resolveLucyMemoryCandidate({
  app,
  userId,
  candidate,
}: {
  app: FastifyInstance
  userId: string
  candidate: LucyMemoryCandidate
}): Promise<LucyMemoryResolution> {
  const normalizedCandidate: LucyMemoryCandidate = {
    ...candidate,
    memoryType: normalizeMemoryType(
      candidate.memoryType
    ),
    memoryKey: normalizeMemoryKey(
      candidate.memoryKey
    ),
    memoryText: normalizeMemoryText(
      candidate.memoryText
    ),
    memoryValueJson:
      candidate.memoryValueJson ?? null,
  }

  if (!normalizedCandidate.memoryKey) {
    throw new Error(
      "Lucy memory candidate requires a stable memory key"
    )
  }

  if (!normalizedCandidate.memoryText) {
    throw new Error(
      "Lucy memory candidate requires memory text"
    )
  }

  const subject =
    await resolveLucyMemorySubject({
      app,
      userId,
      subject: normalizedCandidate.subject,
    })

  const existingMemory = await app.db
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
    .where("subject_id", "=", subject.id)
    .where(
      "memory_type",
      "=",
      normalizedCandidate.memoryType
    )
    .where(
      "memory_key",
      "=",
      normalizedCandidate.memoryKey
    )
    .where("status", "=", "active")
    .executeTakeFirst()

  if (!existingMemory) {
    return {
      decision: "create",
      existingMemoryId: null,
      subjectId: subject.id,
      candidate: normalizedCandidate,
    }
  }

  const sameText =
    existingMemory.memory_text ===
    normalizedCandidate.memoryText

  const sameValue =
    JSON.stringify(
      existingMemory.memory_value_json ?? null
    ) ===
    JSON.stringify(
      normalizedCandidate.memoryValueJson ?? null
    )

  if (sameText && sameValue) {
    return {
      decision: "reinforce",
      existingMemoryId: existingMemory.id,
      subjectId: subject.id,
      candidate: normalizedCandidate,
    }
  }

  return {
    decision: "update",
    existingMemoryId: existingMemory.id,
    subjectId: subject.id,
    candidate: normalizedCandidate,
  }
}