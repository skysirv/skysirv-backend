export function getLucyRealtimeTools() {
  return [
    {
      type: "function",
      name: "retrieve_lucy_memories",
      description:
        "Retrieve relevant persistent Lucy travel memories for the current voice request. Memories may belong to the primary traveler, another individual traveler or companion, or a travel group such as the family. Returned memories include subject metadata identifying who or which group each memory belongs to. Use this when the answer may depend on durable preferences or travel-profile context, including hotel, airline, alliance, seat, cabin, nonstop, layover, family-travel, business-travel, timing, packing, ground-transport, budget, or similar preferences. When the traveler names or clearly refers to a person or group, preserve that identity in the query. Never transfer one subject's preference to another subject.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description:
              "The traveler's current question or request that requires relevant persistent memory. Preserve named people, relationships, or groups when they are relevant, such as Claudia, my wife, Tiago, my son, or my family, so subject-specific memories can be retrieved correctly.",
          },
          recentContext: {
            type: "array",
            items: { type: "string" },
            description:
              "Up to five short recent conversation snippets that help disambiguate the current request, including which traveler, companion, or group is being discussed when relevant.",
          },
        },
        required: [
          "query",
          "recentContext",
        ],
      },
    },
    {
      type: "function",
      name: "retrieve_recent_conversation_context",
      description:
        "Retrieve relevant context from the traveler's recent Lucy conversations when the current request refers to something discussed in another conversation or thread. Use this for requests such as what were we just talking about, what did we discuss before, what trip was I planning, what flight was I looking at, or when the traveler refers to an earlier conversation whose details are not present in the current thread. This is conversation continuity, not persistent traveler memory. Do not use this tool for durable preferences that belong in retrieve_lucy_memories. Answer only from the conversation evidence returned by this tool. If no matching prior conversation context is returned, say that you could not recover the earlier detail and do not invent dates, destinations, airlines, routes, prices, or other travel facts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description:
              "The traveler's current request describing what earlier conversation or travel detail they are trying to recover.",
          },
          recentContext: {
            type: "array",
            items: { type: "string" },
            description:
              "Up to five short snippets from the current conversation that help identify which prior discussion the traveler means.",
          },
        },
        required: [
          "query",
          "recentContext",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_watchlist_route",
      description:
        "Prepare a Skysirv watchlist route action when the user asks Lucy to track or add a route. This does not save the route yet; Skysirv must ask the user for confirmation first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          departureDate: { type: "string" },
          routeLabel: { type: "string" },
          confirmationPrompt: { type: "string" },
        },
        required: [
          "origin",
          "destination",
          "departureDate",
          "routeLabel",
          "confirmationPrompt",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_save_first_name",
      description:
        "Prepare a Skysirv profile-name action when the user clearly asks Lucy to remember or save their first name. This does not save the name yet; Skysirv must ask the user for confirmation first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          firstName: { type: "string" },
          confirmationPrompt: { type: "string" },
        },
        required: [
          "firstName",
          "confirmationPrompt",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_save_preferred_airports",
      description:
        "Prepare a Skysirv preferred-airports action when the user asks Lucy to remember or save one or more airports as preferred airports. This does not save the airports yet; Skysirv must ask the user for confirmation first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          airportCodes: {
            type: "array",
            items: { type: "string" },
          },
          confirmationPrompt: { type: "string" },
        },
        required: [
          "airportCodes",
          "confirmationPrompt",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_save_preferred_route",
      description:
        "Prepare a Skysirv preferred-route action when the user asks Lucy to remember or save an origin and destination as a preferred route. A preferred route does not require a departure date. This does not save the route yet; Skysirv must ask the user for confirmation first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          routeLabel: { type: "string" },
          confirmationPrompt: { type: "string" },
        },
        required: [
          "origin",
          "destination",
          "routeLabel",
          "confirmationPrompt",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_save_visible_flight",
      description:
        "Prepare a Skysirv Saved Flights action when the user asks Lucy to save a specific visible recommended flight from the current dashboard.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          departureDate: { type: "string" },
          airline: { type: "string" },
          airlineName: { type: "string" },
          flightNumber: { type: "string" },
          price: { type: "number" },
          currency: { type: "string" },
          flightLabel: { type: "string" },
          confirmationPrompt: { type: "string" },
        },
        required: [
          "origin",
          "destination",
          "departureDate",
          "airline",
          "airlineName",
          "flightNumber",
          "price",
          "currency",
          "flightLabel",
          "confirmationPrompt",
        ],
      },
    },
    {
      type: "function",
      name: "prepare_save_lucy_memory",
      description:
        "Save a low-risk persistent Lucy travel memory when the traveler clearly provides a stable travel preference or travel-profile fact. This memory is executed immediately and does not require a second confirmation.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          subject: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              subjectType: {
                type: "string",
                enum: ["self", "person", "group"],
              },
              subjectKey: {
                type: "string",
                description:
                  "Stable snake_case identity key for the person or group, such as claudia, tiago, or family. Use self for the primary traveler.",
              },
              displayName: {
                type: "string",
                description:
                  "Human-readable name for the person or group, such as Claudia, Tiago, or Family.",
              },
              relationshipLabel: {
                type: ["string", "null"],
                description:
                  "Known relationship to the primary traveler, such as spouse, child, coworker, friend, or family. Do not guess.",
              },
              aliases: {
                type: "array",
                items: { type: "string" },
                description:
                  "Known ways the traveler refers to this subject, such as Claudia, my wife, wife, or the family.",
              },
            },
            required: [
              "subjectType",
              "subjectKey",
              "displayName",
            ],
          },
          memoryType: { type: "string" },
          memoryKey: { type: "string" },
          memoryText: { type: "string" },
          memoryValueJson: { type: ["object", "null"] },
          confirmationPrompt: {
            type: "string",
            description:
              "A short natural acknowledgement of what Lucy learned. Do not phrase this as a question.",
          },
        },
        required: [
          "subject",
          "memoryType",
          "memoryKey",
          "memoryText",
          "memoryValueJson",
          "confirmationPrompt",
        ],
      },
    },
  ]
}