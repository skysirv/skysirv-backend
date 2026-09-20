import {
    type FlightAttendantChatBody,
    type FlightAttendantRole,
} from "../models/flightAttendant.types.js"

const MAX_CONVERSATION_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 2500

export function cleanMessageText(value: unknown) {
    if (typeof value !== "string") return ""

    return value.trim().slice(0, MAX_MESSAGE_LENGTH)
}

export function normalizeConversation(body: FlightAttendantChatBody) {
    const normalized: Array<{
        role: FlightAttendantRole
        content: string
    }> = []

    if (Array.isArray(body.messages)) {
        for (const item of body.messages) {
            const role = item.role === "assistant" ? "assistant" : "user"
            const content = cleanMessageText(item.content ?? item.text)

            if (!content) continue

            normalized.push({ role, content })
        }
    }

    const directMessage = cleanMessageText(body.message)

    if (directMessage) {
        const lastMessage = normalized[normalized.length - 1]

        if (
            !lastMessage ||
            lastMessage.role !== "user" ||
            lastMessage.content !== directMessage
        ) {
            normalized.push({
                role: "user",
                content: directMessage,
            })
        }
    }

    return normalized.slice(-MAX_CONVERSATION_MESSAGES)
}