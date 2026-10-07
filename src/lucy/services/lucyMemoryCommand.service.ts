import { type FastifyInstance } from "fastify"
import { sql } from "kysely"

import {
  saveLucyMemory,
} from "../../services/lucyMemory.service.js"

import {
  type LucyMemoryCandidate,
} from "../models/lucyMemory.types.js"

import {
  resolveLucyMemoryCandidate,
  type LucyMemoryResolution,
} from "./lucyMemoryResolver.service.js"

export type ExecuteLucyMemoryCommandResult = {
  decision: LucyMemoryResolution["decision"]
  memory: {
    id: string
    user_id: string
    memory_type: string
    memory_key: string
    memory_text: string
    memory_value_json: unknown | null
    confidence: string
    source: string
    status: string
    last_used_at: Date | null
    created_at: Date
    updated_at: Date
  }
}

export async function executeLucyMemoryCommand({
  app,
  userId,
  candidate,
}: {
  app: FastifyInstance
  userId: string
  candidate: LucyMemoryCandidate
}): Promise<ExecuteLucyMemoryCommandResult> {
  const resolution =
    await resolveLucyMemoryCandidate({
      app,
      userId,
      candidate,
    })

  if (resolution.decision === "reinforce") {
    const reinforcedAt = new Date()

    const existingMemory = await app.db
      .updateTable("user_lucy_memories")
      .set({
        reinforcement_count:
          sql<number>`reinforcement_count + 1`,
        last_reinforced_at: reinforcedAt,
      })
      .where(
        "id",
        "=",
        resolution.existingMemoryId
      )
      .where("user_id", "=", userId)
      .where("status", "=", "active")
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

    return {
      decision: "reinforce",
      memory: existingMemory,
    }
  }

  const memory = await saveLucyMemory(app, {
    userId,
    subjectId: resolution.subjectId,
    memoryType: resolution.candidate.memoryType,
    memoryKey: resolution.candidate.memoryKey,
    memoryText: resolution.candidate.memoryText,
    memoryValueJson:
      resolution.candidate.memoryValueJson ?? null,
    confidence: resolution.candidate.confidence,
    source: resolution.candidate.source,
    channel: resolution.candidate.channel,
    sourceConversationId:
      resolution.candidate.sourceConversationId ??
      null,
    sourceMessageId:
      resolution.candidate.sourceMessageId ?? null,
  })

  return {
    decision: resolution.decision,
    memory,
  }
}