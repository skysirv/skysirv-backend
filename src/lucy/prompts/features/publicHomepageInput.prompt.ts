import { type FlightAttendantRole } from "../../models/flightAttendant.types.js"
import { PUBLIC_HOMEPAGE_LUCY_SYSTEM_PROMPT } from "./publicHomepageLucy.prompt.js"

export function buildPublicHomepageOpenAIInput({
    conversation,
}: {
    conversation: Array<{
        role: FlightAttendantRole
        content: string
    }>
}) {
    return [
        {
            role: "system" as const,
            content: `${PUBLIC_HOMEPAGE_LUCY_SYSTEM_PROMPT}

Current server date: ${new Date().toISOString().slice(0, 10)}

The following is the current public homepage conversation. Respond to the latest user message while respecting the public access blockers.`,
        },
        ...conversation.map((message) => ({
            role: message.role,
            content: message.content,
        })),
    ]
}