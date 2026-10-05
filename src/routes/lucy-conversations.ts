import { FastifyInstance } from "fastify"

import {
  createLucyConversation,
  deleteLucyConversation,
  getLucyConversation,
  getLucyConversationMessages,
  getRecentLucyConversations,
  saveLucyConversationMessage,
  updateLucyConversation,
} from "../lucy/services/lucyConversation.service.js"

export async function lucyConversationRoutes(app: FastifyInstance) {
  app.get(
    "/lucy/conversations",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const query = (request.query ?? {}) as {
        limit?: string
      }

      const parsedLimit = Number(query.limit)

      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? parsedLimit
          : 20

      const conversations =
        await getRecentLucyConversations(
          app,
          user.id,
          limit
        )

      return {
        success: true,
        conversations,
      }
    }
  )

  app.post(
    "/lucy/conversations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const body = (request.body ?? {}) as {
        title?: unknown
      }

      const title =
        typeof body.title === "string"
          ? body.title
          : undefined

      const conversation =
        await createLucyConversation(app, {
          userId: user.id,
          title,
        })

      return reply.status(201).send({
        success: true,
        conversation,
      })
    }
  )

  app.get(
    "/lucy/conversations/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const { id } = request.params as {
        id: string
      }

      const conversation =
        await getLucyConversation(
          app,
          user.id,
          id
        )

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: "Lucy conversation not found.",
        })
      }

      const messages =
        await getLucyConversationMessages(
          app,
          user.id,
          conversation.id
        )

      return reply.send({
        success: true,
        conversation,
        messages,
      })
    }
  )

  app.patch(
    "/lucy/conversations/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const { id } = request.params as {
        id: string
      }

      const body = (request.body ?? {}) as {
        title?: unknown
        pinned?: unknown
        plannedTrip?: unknown
      }

      const hasTitle = typeof body.title === "string"
      const hasPinned = typeof body.pinned === "boolean"
      const hasPlannedTrip =
        typeof body.plannedTrip === "boolean"

      if (!hasTitle && !hasPinned && !hasPlannedTrip) {
        return reply.status(400).send({
          success: false,
          error:
            "At least one conversation update field is required.",
        })
      }

      try {
        const conversation =
          await updateLucyConversation(app, {
            userId: user.id,
            conversationId: id,
            title:
              typeof body.title === "string"
                ? body.title
                : undefined,
            pinned:
              typeof body.pinned === "boolean"
                ? body.pinned
                : undefined,
            plannedTrip:
              typeof body.plannedTrip === "boolean"
                ? body.plannedTrip
                : undefined,
          })

        return reply.send({
          success: true,
          conversation,
        })
      } catch {
        return reply.status(404).send({
          success: false,
          error: "Lucy conversation not found.",
        })
      }
    }
  )

  app.delete(
    "/lucy/conversations/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const { id } = request.params as {
        id: string
      }

      try {
        const conversation =
          await deleteLucyConversation(app, {
            userId: user.id,
            conversationId: id,
          })

        return reply.send({
          success: true,
          conversation,
        })
      } catch {
        return reply.status(404).send({
          success: false,
          error: "Lucy conversation not found.",
        })
      }
    }
  )

  app.post(
    "/lucy/conversations/:id/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as {
        id: string
        email?: string
      }

      const { id } = request.params as {
        id: string
      }

      const body = (request.body ?? {}) as {
        role?: unknown
        content?: unknown
        source?: unknown
        clientMessageId?: unknown
      }

      const role =
        body.role === "user" ||
          body.role === "assistant"
          ? body.role
          : null

      const content =
        typeof body.content === "string"
          ? body.content
          : ""

      const source =
        typeof body.source === "string"
          ? body.source
          : undefined

      const clientMessageId =
        typeof body.clientMessageId === "string"
          ? body.clientMessageId
          : null

      if (!role) {
        return reply.status(400).send({
          success: false,
          error:
            "Lucy conversation message role must be user or assistant.",
        })
      }

      if (!content.trim()) {
        return reply.status(400).send({
          success: false,
          error:
            "Lucy conversation message content is required.",
        })
      }

      const conversation =
        await getLucyConversation(
          app,
          user.id,
          id
        )

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: "Lucy conversation not found.",
        })
      }

      const message =
        await saveLucyConversationMessage(
          app,
          {
            userId: user.id,
            conversationId: conversation.id,
            role,
            content,
            source,
            clientMessageId,
          }
        )

      return reply.status(201).send({
        success: true,
        message,
      })
    }
  )
}