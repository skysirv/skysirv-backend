import { describe, expect, it, vi } from "vitest"
import { resolveLucyMemorySubject } from "./lucyMemorySubject.service.js"

describe("Lucy memory subject identity", () => {
  it("does not confuse different children sharing the same relationship", async () => {
    const existingSubjects = [
      {
        id: "isabella-id",
        user_id: "test-user",
        subject_type: "person",
        subject_key: "isabella",
        display_name: "Isabella",
        relationship_label: "child",
        aliases: ["Isabella"],
        status: "active",
      },
    ]

    const createdSubjects: any[] = []

    const mockDb = {
      selectFrom: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(existingSubjects),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn((value) => {
          createdSubjects.push(value)
          return {
            onConflict: vi.fn(() => ({
              returning: vi.fn(() => ({
                executeTakeFirst: vi.fn().mockResolvedValue({
                  id: "tiago-id",
                  ...value,
                }),
              })),
            })),
          }
        }),
      })),
    }

    const result = await resolveLucyMemorySubject({
      app: { db: mockDb } as any,
      userId: "test-user",
      subject: {
        subjectType: "person",
        subjectKey: "tiago",
        displayName: "Tiago",
        relationshipLabel: "child",
        aliases: ["Tiago"],
      },
    })

    expect(result.subject_key).toBe("tiago")
    expect(result.id).not.toBe("isabella-id")
    expect(result.id).toBe(createdSubjects[0].id)
    expect(createdSubjects).toHaveLength(1)
    expect(createdSubjects[0].subject_key).toBe("tiago")
  })

  it("does not confuse Sofia with existing siblings", async () => {
    const existingSubjects = [
      {
        id: "isabella-id",
        user_id: "test-user",
        subject_type: "person",
        subject_key: "isabella",
        display_name: "Isabella",
        relationship_label: "child",
        aliases: ["Isabella"],
        status: "active",
      },
      {
        id: "tiago-id",
        user_id: "test-user",
        subject_type: "person",
        subject_key: "tiago",
        display_name: "Tiago",
        relationship_label: "child",
        aliases: ["Tiago"],
        status: "active",
      },
    ]

    const createdSubjects: any[] = []

    const mockDb = {
      selectFrom: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(existingSubjects),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn((value) => {
          createdSubjects.push(value)
          return {
            onConflict: vi.fn(() => ({
              returning: vi.fn(() => ({
                executeTakeFirst: vi.fn().mockResolvedValue(value),
              })),
            })),
          }
        }),
      })),
    }

    const result = await resolveLucyMemorySubject({
      app: { db: mockDb } as any,
      userId: "test-user",
      subject: {
        subjectType: "person",
        subjectKey: "sofia",
        displayName: "Sofia",
        relationshipLabel: "child",
        aliases: ["Sofia"],
      },
    })

    expect(result.subject_key).toBe("sofia")
    expect(result.id).not.toBe("isabella-id")
    expect(result.id).not.toBe("tiago-id")
    expect(createdSubjects).toHaveLength(1)
    expect(createdSubjects[0].subject_key).toBe("sofia")
  })

  it("does not merge different people sharing a first-name alias", async () => {
    const existingSubjects = [
      {
        id: "alex-morgan-id",
        user_id: "test-user",
        subject_type: "person",
        subject_key: "alex_morgan",
        display_name: "Alex Morgan",
        relationship_label: "coworker",
        aliases: ["Alex Morgan", "Alex"],
        status: "active",
      },
    ]

    const createdSubjects: any[] = []

    const mockDb = {
      selectFrom: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(existingSubjects),
      })),
      insertInto: vi.fn(() => ({
        values: vi.fn((value) => {
          createdSubjects.push(value)
          return {
            onConflict: vi.fn(() => ({
              returning: vi.fn(() => ({
                executeTakeFirst: vi.fn().mockResolvedValue(value),
              })),
            })),
          }
        }),
      })),
    }

    const result = await resolveLucyMemorySubject({
      app: { db: mockDb } as any,
      userId: "test-user",
      subject: {
        subjectType: "person",
        subjectKey: "alex_rivera",
        displayName: "Alex Rivera",
        relationshipLabel: "friend",
        aliases: ["Alex Rivera", "Alex"],
      },
    })

    expect(result.subject_key).toBe("alex_rivera")
    expect(result.id).not.toBe("alex-morgan-id")
    expect(createdSubjects).toHaveLength(1)
    expect(createdSubjects[0].subject_key).toBe("alex_rivera")
  })
})