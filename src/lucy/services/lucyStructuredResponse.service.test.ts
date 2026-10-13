import { describe, expect, it } from "vitest"

import {
  parseLucyStructuredChatResponseValue,
} from "./lucyStructuredResponse.service.js"

describe("Lucy multi-memory structured responses", () => {
  it("preserves three independent family memories", () => {
    const names = [
      ["isabella", "Isabella", "soccer"],
      ["tiago", "Tiago", "trains"],
      ["sofia", "Sofia", "Barbies"],
    ] as const

    const result = parseLucyStructuredChatResponseValue({
      reply: "I'll remember each child's interests.",
      action: null,
      memoryActions: names.map(([key, name, interest]) => ({
        type: "save_lucy_memory",
        status: "needs_confirmation",
        subject: {
          subjectType: "person",
          subjectKey: key,
          displayName: name,
          relationshipLabel: "child",
          aliases: [name],
        },
        memoryType: "general_travel_note",
        memoryKey: "travel_interests",
        memoryText: `${name} loves ${interest}.`,
        memoryValueJson: null,
        confirmationPrompt: `I'll remember that ${name} loves ${interest}.`,
      })),
    })

    expect(result.action).toBeNull()
    expect(result.memoryActions).toHaveLength(3)

    expect(
      result.memoryActions?.map((action) => action.subject?.subjectKey)
    ).toEqual(["isabella", "tiago", "sofia"])
  })

  it("rejects an invalid memory subject", () => {
    const result = parseLucyStructuredChatResponseValue({
      reply: "I'll remember that preference.",
      action: null,
      memoryActions: [
        {
          type: "save_lucy_memory",
          status: "needs_confirmation",
          subject: {
            subjectType: "person",
            subjectKey: "",
            displayName: "",
            relationshipLabel: "child",
            aliases: [],
          },
          memoryType: "general_travel_note",
          memoryKey: "travel_interests",
          memoryText: "A child loves trains.",
          memoryValueJson: null,
          confirmationPrompt: "I'll remember that.",
        },
      ],
    })

    expect(result.memoryActions).toEqual([])
  })

  it("rejects more than five memory actions", () => {
    const memoryActions = Array.from(
      { length: 6 },
      (_, index) => ({
        type: "save_lucy_memory" as const,
        status: "needs_confirmation" as const,
        subject: {
          subjectType: "person" as const,
          subjectKey: `traveler_${index + 1}`,
          displayName: `Traveler ${index + 1}`,
          relationshipLabel: "friend",
          aliases: [`Traveler ${index + 1}`],
        },
        memoryType: "general_travel_note",
        memoryKey: "travel_interests",
        memoryText: `Traveler ${index + 1} enjoys sightseeing.`,
        memoryValueJson: null,
        confirmationPrompt: "I'll remember that.",
      })
    )

    expect(() =>
      parseLucyStructuredChatResponseValue({
        reply: "I'll remember everyone's interests.",
        action: null,
        memoryActions,
      })
    ).toThrow()
  })

  it("preserves existing single-action behavior", () => {
    const result = parseLucyStructuredChatResponseValue({
      reply: "Would you like me to save Miami as a preferred airport?",
      action: {
        type: "save_preferred_airports",
        status: "needs_confirmation",
        airportCodes: ["MIA"],
        airportLabels: ["Miami International"],
        confirmationPrompt:
          "Would you like me to save Miami as a preferred airport?",
      },
      memoryActions: [],
    })

    expect(result.action?.type).toBe("save_preferred_airports")
    expect(result.memoryActions).toEqual([])
  })
})