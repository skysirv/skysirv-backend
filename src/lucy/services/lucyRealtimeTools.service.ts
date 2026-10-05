export function getLucyRealtimeTools() {
  return [
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