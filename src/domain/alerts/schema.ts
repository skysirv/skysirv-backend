import { z } from "zod"

export const createAlertSchema = z.object({
  route_hash: z.string().min(10),

  watchlist_id: z.number().int().positive().nullable().optional(),

  alert_type: z.enum(["absolute", "percentage", "route_lowest"]),

  threshold_value: z.number().positive().nullable().optional(),

  direction: z.enum(["below", "above"]).nullable().optional(),
})

export type CreateAlertInput = z.infer<typeof createAlertSchema>