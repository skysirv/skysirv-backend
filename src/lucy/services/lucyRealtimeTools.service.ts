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
                "Prepare a Lucy persistent memory action when the user explicitly asks Lucy to remember a travel-related preference or note.",
            parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                    memoryType: { type: "string" },
                    memoryKey: { type: "string" },
                    memoryText: { type: "string" },
                    memoryValueJson: { type: ["object", "null"] },
                    confirmationPrompt: { type: "string" },
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