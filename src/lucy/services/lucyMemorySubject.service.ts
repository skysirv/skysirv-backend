import crypto from "crypto"

import { type FastifyInstance } from "fastify"

import {
  type LucyMemorySubjectCandidate,
  type LucyMemorySubjectType,
} from "../models/lucyMemory.types.js"

function normalizeSubjectKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)
}

function normalizeComparisonValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function cleanDisplayName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120)
}

function cleanRelationshipLabel(
  value: string | null | undefined
) {
  const cleaned = (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 80)

  return cleaned || null
}

function cleanAliases(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) =>
          value
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120)
        )
        .filter(Boolean)
    )
  )
}

function getStoredAliases(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      Boolean(item.trim())
  )
}

export async function getOrCreateSelfLucyMemorySubject(
  app: FastifyInstance,
  userId: string
) {
  const existingSubject = await app.db
    .selectFrom("user_lucy_memory_subjects")
    .select([
      "id",
      "user_id",
      "subject_type",
      "subject_key",
      "display_name",
      "relationship_label",
      "aliases",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("subject_type", "=", "self")
    .where("subject_key", "=", "self")
    .where("status", "=", "active")
    .executeTakeFirst()

  if (existingSubject) {
    return existingSubject
  }

  const user = await app.db
    .selectFrom("users")
    .select(["first_name"])
    .where("id", "=", userId)
    .executeTakeFirst()

  const now = new Date()

  await app.db
    .insertInto("user_lucy_memory_subjects")
    .values({
      id: crypto.randomUUID(),
      user_id: userId,
      subject_type: "self",
      subject_key: "self",
      display_name:
        user?.first_name?.trim() || "Traveler",
      relationship_label: "self",
      aliases: JSON.stringify(["self", "me"]),
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns([
          "user_id",
          "subject_type",
          "subject_key",
        ])
        .doNothing()
    )
    .execute()

  return app.db
    .selectFrom("user_lucy_memory_subjects")
    .select([
      "id",
      "user_id",
      "subject_type",
      "subject_key",
      "display_name",
      "relationship_label",
      "aliases",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("subject_type", "=", "self")
    .where("subject_key", "=", "self")
    .where("status", "=", "active")
    .executeTakeFirstOrThrow()
}

export async function resolveLucyMemorySubject({
  app,
  userId,
  subject,
}: {
  app: FastifyInstance
  userId: string
  subject?: LucyMemorySubjectCandidate
}) {
  if (
    !subject ||
    subject.subjectType === "self"
  ) {
    return getOrCreateSelfLucyMemorySubject(
      app,
      userId
    )
  }

  const subjectType: LucyMemorySubjectType =
    subject.subjectType

  const subjectKey =
    normalizeSubjectKey(subject.subjectKey)

  const displayName =
    cleanDisplayName(subject.displayName)

  const relationshipLabel =
    cleanRelationshipLabel(
      subject.relationshipLabel
    )

  const aliases = cleanAliases(subject.aliases)

  if (!subjectKey) {
    throw new Error(
      "Lucy memory subject requires a stable subject key"
    )
  }

  if (!displayName) {
    throw new Error(
      "Lucy memory subject requires a display name"
    )
  }

  const subjects = await app.db
    .selectFrom("user_lucy_memory_subjects")
    .select([
      "id",
      "user_id",
      "subject_type",
      "subject_key",
      "display_name",
      "relationship_label",
      "aliases",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("subject_type", "=", subjectType)
    .where("status", "=", "active")
    .execute()

  const exactKeyMatch = subjects.find(
    (existingSubject) =>
      existingSubject.subject_key ===
      subjectKey
  )

  if (exactKeyMatch) {
    return exactKeyMatch
  }

  const candidateIdentityValues = new Set(
    [
      displayName,
      subjectKey.replace(/_/g, " "),
      ...aliases,
    ]
      .map(normalizeComparisonValue)
      .filter(Boolean)
  )

  const identityMatches = subjects.filter(
    (existingSubject) => {
      const existingIdentityValues = [
        existingSubject.display_name,
        existingSubject.subject_key.replace(
          /_/g,
          " "
        ),
        ...getStoredAliases(
          existingSubject.aliases
        ),
      ]
        .map(normalizeComparisonValue)
        .filter(Boolean)

      return existingIdentityValues.some(
        (value) =>
          candidateIdentityValues.has(value)
      )
    }
  )

  if (identityMatches.length === 1) {
    return identityMatches[0]
  }

  if (
    relationshipLabel &&
    subjectType === "person"
  ) {
    const relationshipMatches =
      subjects.filter(
        (existingSubject) =>
          cleanRelationshipLabel(
            existingSubject.relationship_label
          ) === relationshipLabel
      )

    if (relationshipMatches.length === 1) {
      return relationshipMatches[0]
    }
  }

  const now = new Date()

  const createdSubject = await app.db
    .insertInto("user_lucy_memory_subjects")
    .values({
      id: crypto.randomUUID(),
      user_id: userId,
      subject_type: subjectType,
      subject_key: subjectKey,
      display_name: displayName,
      relationship_label: relationshipLabel,
      aliases: JSON.stringify(aliases),
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns([
          "user_id",
          "subject_type",
          "subject_key",
        ])
        .doNothing()
    )
    .returning([
      "id",
      "user_id",
      "subject_type",
      "subject_key",
      "display_name",
      "relationship_label",
      "aliases",
      "status",
      "created_at",
      "updated_at",
    ])
    .executeTakeFirst()

  if (createdSubject) {
    return createdSubject
  }

  return app.db
    .selectFrom("user_lucy_memory_subjects")
    .select([
      "id",
      "user_id",
      "subject_type",
      "subject_key",
      "display_name",
      "relationship_label",
      "aliases",
      "status",
      "created_at",
      "updated_at",
    ])
    .where("user_id", "=", userId)
    .where("subject_type", "=", subjectType)
    .where("subject_key", "=", subjectKey)
    .where("status", "=", "active")
    .executeTakeFirstOrThrow()
}