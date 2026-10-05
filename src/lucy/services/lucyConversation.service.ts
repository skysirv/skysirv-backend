import crypto from "crypto"
import { FastifyInstance } from "fastify"

export type LucyConversationRole = "user" | "assistant"

export type CreateLucyConversationInput = {
  userId: string
  title?: string
}

export type SaveLucyConversationMessageInput = {
  userId: string
  conversationId: string
  role: LucyConversationRole
  content: string
  source?: string
  clientMessageId?: string | null
}

export type UpdateLucyConversationInput = {
  userId: string
  conversationId: string
  title?: string
  pinned?: boolean
  plannedTrip?: boolean
}

export type DeleteLucyConversationInput = {
  userId: string
  conversationId: string
}

function cleanConversationTitle(value: string | undefined) {
  const cleanValue = (value || "")
    .trim()
    .replace(/\s+/g, " ")

  return cleanValue
    ? cleanValue.slice(0, 120)
    : "New conversation"
}

function cleanConversationContent(value: string) {
  return value.trim().slice(0, 12000)
}

function cleanConversationSource(value: string | undefined) {
  const cleanValue = (value || "dashboard_text")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return cleanValue
    ? cleanValue.slice(0, 80)
    : "dashboard_text"
}

function cleanClientMessageId(
  value: string | null | undefined
) {
  const cleanValue =
    typeof value === "string"
      ? value.trim()
      : ""

  return cleanValue
    ? cleanValue.slice(0, 160)
    : null
}

export async function createLucyConversation(
  app: FastifyInstance,
  input: CreateLucyConversationInput
) {
  const now = new Date()

  return app.db
    .insertInto("lucy_conversations")
    .values({
      id: crypto.randomUUID(),
      user_id: input.userId,
      title: cleanConversationTitle(input.title),
      pinned: false,
      planned_trip: false,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .returning([
      "id",
      "user_id",
      "title",
      "pinned",
      "planned_trip",
      "status",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirstOrThrow()
}

export async function getLucyConversation(
  app: FastifyInstance,
  userId: string,
  conversationId: string
) {
  return app.db
    .selectFrom("lucy_conversations")
    .select([
      "id",
      "user_id",
      "title",
      "pinned",
      "planned_trip",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("id", "=", conversationId)
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .executeTakeFirst()
}

export async function getRecentLucyConversations(
  app: FastifyInstance,
  userId: string,
  limit = 20
) {
  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 1),
    50
  )

  return app.db
    .selectFrom("lucy_conversations")
    .select([
      "id",
      "user_id",
      "title",
      "pinned",
      "planned_trip",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .orderBy("updated_at", "desc")
    .limit(safeLimit)
    .execute()
}

export async function getLucyConversationMessages(
  app: FastifyInstance,
  userId: string,
  conversationId: string
) {
  const conversation = await getLucyConversation(
    app,
    userId,
    conversationId
  )

  if (!conversation) {
    return []
  }

  return app.db
    .selectFrom("lucy_conversation_messages")
    .select([
      "id",
      "conversation_id",
      "user_id",
      "role",
      "content",
      "source",
      "client_message_id",
      "created_at",
    ])
    .where("conversation_id", "=", conversationId)
    .where("user_id", "=", userId)
    .orderBy("created_at", "asc")
    .execute()
}

export async function saveLucyConversationMessage(
  app: FastifyInstance,
  input: SaveLucyConversationMessageInput
) {
  const conversation = await getLucyConversation(
    app,
    input.userId,
    input.conversationId
  )

  if (!conversation) {
    throw new Error("Lucy conversation was not found")
  }

  const content = cleanConversationContent(input.content)

  if (!content) {
    throw new Error("Conversation message content is required")
  }

  const clientMessageId = cleanClientMessageId(
    input.clientMessageId
  )

  if (clientMessageId) {
    const existingMessage = await app.db
      .selectFrom("lucy_conversation_messages")
      .select([
        "id",
        "conversation_id",
        "user_id",
        "role",
        "content",
        "source",
        "client_message_id",
        "created_at",
      ])
      .where(
        "conversation_id",
        "=",
        input.conversationId
      )
      .where(
        "client_message_id",
        "=",
        clientMessageId
      )
      .executeTakeFirst()

    if (existingMessage) {
      return existingMessage
    }
  }

  const now = new Date()

  const message = await app.db
    .insertInto("lucy_conversation_messages")
    .values({
      id: crypto.randomUUID(),
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content,
      source: cleanConversationSource(input.source),
      client_message_id: clientMessageId,
      created_at: now,
    })
    .returning([
      "id",
      "conversation_id",
      "user_id",
      "role",
      "content",
      "source",
      "client_message_id",
      "created_at",
    ])
    .executeTakeFirstOrThrow()

  if (
    input.role === "user" &&
    conversation.title === "New conversation"
  ) {
    const generatedTitle =
      content
        .replace(/^lucy[,\s]+/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 72) || "New conversation"

    await app.db
      .updateTable("lucy_conversations")
      .set({
        title: generatedTitle,
        updated_at: now,
      })
      .where("id", "=", input.conversationId)
      .where("user_id", "=", input.userId)
      .execute()
  }

  await app.db
    .updateTable("lucy_conversations")
    .set({
      updated_at: now,
    })
    .where("id", "=", input.conversationId)
    .where("user_id", "=", input.userId)
    .execute()

  return message
}

export async function updateLucyConversation(
  app: FastifyInstance,
  input: UpdateLucyConversationInput
) {
  const existingConversation = await getLucyConversation(
    app,
    input.userId,
    input.conversationId
  )

  if (!existingConversation) {
    throw new Error("Lucy conversation was not found")
  }

  const updates: {
    title?: string
    pinned?: boolean
    planned_trip?: boolean
    updated_at: Date
  } = {
    updated_at: new Date(),
  }

  if (typeof input.title === "string") {
    updates.title = cleanConversationTitle(input.title)
  }

  if (typeof input.pinned === "boolean") {
    updates.pinned = input.pinned
  }

  if (typeof input.plannedTrip === "boolean") {
    updates.planned_trip = input.plannedTrip
  }

  return app.db
    .updateTable("lucy_conversations")
    .set(updates)
    .where("id", "=", input.conversationId)
    .where("user_id", "=", input.userId)
    .returning([
      "id",
      "user_id",
      "title",
      "pinned",
      "planned_trip",
      "status",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirstOrThrow()
}

export async function deleteLucyConversation(
  app: FastifyInstance,
  input: DeleteLucyConversationInput
) {
  const existingConversation = await getLucyConversation(
    app,
    input.userId,
    input.conversationId
  )

  if (!existingConversation) {
    throw new Error("Lucy conversation was not found")
  }

  const now = new Date()

  return app.db
    .updateTable("lucy_conversations")
    .set({
      status: "deleted",
      updated_at: now,
    })
    .where("id", "=", input.conversationId)
    .where("user_id", "=", input.userId)
    .returning([
      "id",
      "user_id",
      "title",
      "pinned",
      "planned_trip",
      "status",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirstOrThrow()
}