import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  emails: defineTable({
    from: v.string(),
    to: v.optional(v.string()),
    cc: v.optional(v.string()),
    bcc: v.optional(v.string()),
    subject: v.string(),
    preview: v.string(),
    body: v.string(),
    read: v.boolean(),
    starred: v.boolean(),
    archived: v.optional(v.boolean()),
    trashed: v.optional(v.boolean()),
    draft: v.optional(v.boolean()),
    sent: v.optional(v.boolean()),
    receivedAt: v.number(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    category: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.array(v.string())),
    replyTo: v.optional(v.string()),
    rawHeaders: v.optional(v.string()),
  })
    // Performance indexes for filtered queries
    .index("by_receivedAt", ["receivedAt"]) // Chronological ordering (inbox, sent, etc.)
    .index("by_messageId", ["messageId"])    // Idempotency check for webhook deduplication
    .index("by_threadId", ["threadId"])       // Thread grouping for conversation view
    .index("by_read", ["read"])               // Unread count queries (fast filtering)
    .index("by_archived", ["archived"])       // Archive view queries
    .index("by_trashed", ["trashed"])         // Trash view queries
    .index("by_draft", ["draft"]),            // Draft view queries
  webhook_rate_limits: defineTable({
    ip: v.string(),
    minuteBucket: v.number(),
    count: v.number(),
  })
    .index("by_ip_bucket", ["ip", "minuteBucket"]),
  webhook_security_logs: defineTable({
    timestamp: v.number(),
    ip: v.string(),
    eventType: v.string(),
    details: v.optional(v.string()),
  })
    .index("by_timestamp", ["timestamp"]),
  contacts: defineTable({
    primaryEmail: v.string(),
    name: v.optional(v.string()),
    emails: v.optional(v.array(v.string())),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    lastContactedAt: v.optional(v.number()),
    crmIds: v.optional(v.object({
      hubspot: v.optional(v.string()),
      salesforce: v.optional(v.string()),
      pipedrive: v.optional(v.string()),
    })),
    enrichment: v.optional(v.object({
      contactId: v.id("contacts"),
      provider: v.string(),
      updatedAt: v.number(),
      lastRunStatus: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("error"), v.literal("skipped")),
      lastRunError: v.optional(v.string()),
      fields: v.optional(v.any()),
    })),
    customFields: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_primaryEmail", ["primaryEmail"])
    .index("by_name", ["name"])
    .index("by_updatedAt", ["updatedAt"]),
  user_settings: defineTable({
    userId: v.string(),
    incomingSound: v.string(),
    outgoingSound: v.string(),
  })
    .index("by_userId", ["userId"]),
});


