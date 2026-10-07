export const LUCY_MEMORY_SUBJECT_TYPES = [
  "self",
  "person",
  "group",
] as const

export type LucyMemorySubjectType =
  (typeof LUCY_MEMORY_SUBJECT_TYPES)[number]

export type LucyMemorySubjectCandidate = {
  subjectType: LucyMemorySubjectType
  subjectKey: string
  displayName: string
  relationshipLabel?: string | null
  aliases?: string[]
}

export const LUCY_MEMORY_TYPES = [
  "travel_preference",
  "home_airport",
  "preferred_airline",
  "preferred_route",
  "trip_style",
  "family_travel",
  "business_travel",
  "general_travel_note",
] as const

export type LucyMemoryType =
  (typeof LUCY_MEMORY_TYPES)[number]

export const LUCY_MEMORY_CONFIDENCE_LEVELS = [
  "confirmed",
  "inferred",
] as const

export type LucyMemoryConfidence =
  (typeof LUCY_MEMORY_CONFIDENCE_LEVELS)[number]

export const LUCY_MEMORY_SOURCES = [
  "explicit_user_request",
  "explicit_user_statement",
  "profile_answer",
  "inferred_pattern",
  "system_import",

  // Existing Memory 1.0 values kept readable during migration.
  "user_confirmed",
  "conversational",
] as const

export type LucyMemorySource =
  (typeof LUCY_MEMORY_SOURCES)[number]

export const LUCY_MEMORY_STATUSES = [
  "active",
  "superseded",
  "deleted",
] as const

export type LucyMemoryStatus =
  (typeof LUCY_MEMORY_STATUSES)[number]

export const LUCY_MEMORY_CHANNELS = [
  "text",
  "voice",
  "system",
  "unknown",
] as const

export type LucyMemoryChannel =
  (typeof LUCY_MEMORY_CHANNELS)[number]

export type LucyMemoryCandidate = {
  subject?: LucyMemorySubjectCandidate

  memoryType: LucyMemoryType
  memoryKey: string
  memoryText: string
  memoryValueJson?: unknown | null

  confidence: LucyMemoryConfidence
  source: LucyMemorySource
  channel: LucyMemoryChannel

  sourceConversationId?: string | null
  sourceMessageId?: string | null
}

export function isLucyMemorySubjectType(
  value: string
): value is LucyMemorySubjectType {
  return LUCY_MEMORY_SUBJECT_TYPES.includes(
    value as LucyMemorySubjectType
  )
}

export function isLucyMemoryType(
  value: string
): value is LucyMemoryType {
  return LUCY_MEMORY_TYPES.includes(
    value as LucyMemoryType
  )
}

export function isLucyMemoryConfidence(
  value: string
): value is LucyMemoryConfidence {
  return LUCY_MEMORY_CONFIDENCE_LEVELS.includes(
    value as LucyMemoryConfidence
  )
}

export function isLucyMemorySource(
  value: string
): value is LucyMemorySource {
  return LUCY_MEMORY_SOURCES.includes(
    value as LucyMemorySource
  )
}

export function isLucyMemoryStatus(
  value: string
): value is LucyMemoryStatus {
  return LUCY_MEMORY_STATUSES.includes(
    value as LucyMemoryStatus
  )
}