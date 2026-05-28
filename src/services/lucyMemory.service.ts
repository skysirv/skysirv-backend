import crypto from "crypto"
import { FastifyInstance } from "fastify"

export type LucyMemoryType =
  | "travel_preference"
  | "home_airport"
  | "preferred_airline"
  | "preferred_route"
  | "trip_style"
  | "family_travel"
  | "business_travel"
  | "general_travel_note"

export type SaveLucyMemoryInput = {
  userId: string
  memoryType: string
  memoryKey: string
  memoryText: string
  memoryValueJson?: unknown | null
  confidence?: string
  source?: string
}

function cleanMemoryType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_")

  if (!normalized) return "general_travel_note"

  return normalized.slice(0, 80)
}

function cleanMemoryKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (!normalized) return `memory_${Date.now()}`

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
      "status",
      "last_used_at",
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

  if (!memoryText) {
    throw new Error("Memory text is required")
  }

  const now = new Date()

  return app.db
    .insertInto("user_lucy_memories")
    .values({
      id: crypto.randomUUID(),
      user_id: input.userId,
      memory_type: memoryType,
      memory_key: memoryKey,
      memory_text: memoryText,
      memory_value_json: input.memoryValueJson ?? null,
      confidence: input.confidence || "confirmed",
      source: input.source || "user_confirmed",
      status: "active",
      last_used_at: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns(["user_id", "memory_type", "memory_key"])
        .doUpdateSet({
          memory_text: memoryText,
          memory_value_json: input.memoryValueJson ?? null,
          confidence: input.confidence || "confirmed",
          source: input.source || "user_confirmed",
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
      "status",
      "last_used_at",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirstOrThrow()
}

export async function markLucyMemoriesUsed(
  app: FastifyInstance,
  userId: string
) {
  await app.db
    .updateTable("user_lucy_memories")
    .set({
      last_used_at: new Date(),
      updated_at: new Date(),
    })
    .where("user_id", "=", userId)
    .where("status", "=", "active")
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