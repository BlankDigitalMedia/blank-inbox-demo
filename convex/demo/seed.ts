/**
 * Demo Seed Data Mutations
 * 
 * Internal mutations for seeding demo data. Only accessible when DEMO_MODE is enabled.
 * 
 * SAFETY: All mutations check DEMO_MODE === "true" before executing.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { sampleEmails, sampleContacts } from "./sample_data";

/**
 * Check if demo mode is enabled (server-side)
 */
function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Seed demo emails into the database
 * 
 * Inserts all sample emails from sample_data.ts
 * Only works when DEMO_MODE is enabled
 */
export const seedDemoEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    const insertedIds: string[] = [];

    for (const email of sampleEmails) {
      // Check if email already exists by messageId
      let existingId = null;
      if (email.messageId) {
        const existing = await ctx.db
          .query("emails")
          .withIndex("by_messageId", (q) => q.eq("messageId", email.messageId))
          .first();
        if (existing) {
          existingId = existing._id;
        }
      }

      const emailData = {
        from: email.from,
        to: email.to,
        cc: ("cc" in email ? email.cc : undefined) as string | undefined,
        bcc: ("bcc" in email ? email.bcc : undefined) as string | undefined,
        subject: email.subject,
        preview: email.preview,
        body: email.body,
        read: email.read,
        starred: email.starred,
        archived: ("archived" in email ? email.archived : undefined) as boolean | undefined,
        trashed: ("trashed" in email ? email.trashed : undefined) as boolean | undefined,
        draft: ("draft" in email ? email.draft : undefined) as boolean | undefined,
        sent: ("sent" in email ? email.sent : undefined) as boolean | undefined,
        receivedAt: email.receivedAt,
        messageId: email.messageId,
        threadId: email.threadId,
        category: ("category" in email ? email.category : undefined) as string | undefined,
        inReplyTo: ("inReplyTo" in email ? email.inReplyTo : undefined) as string | undefined,
        references: ("references" in email ? email.references : undefined) as string[] | undefined,
        replyTo: ("replyTo" in email ? email.replyTo : undefined) as string | undefined,
        rawHeaders: ("rawHeaders" in email ? email.rawHeaders : undefined) as string | undefined,
      };

      if (existingId) {
        // Update existing email
        await ctx.db.patch(existingId, emailData);
        insertedIds.push(existingId);
      } else {
        // Insert new email
        const id = await ctx.db.insert("emails", emailData);
        insertedIds.push(id);
      }
    }

    return {
      success: true,
      count: insertedIds.length,
      message: `Seeded ${insertedIds.length} demo emails`,
    };
  },
});

/**
 * Seed demo contacts into the database
 * 
 * Inserts all sample contacts from sample_data.ts
 * Only works when DEMO_MODE is enabled
 */
export const seedDemoContacts = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    const insertedIds: string[] = [];
    const now = Date.now();

    for (const contact of sampleContacts) {
      // Check if contact already exists by primaryEmail
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_primaryEmail", (q) => q.eq("primaryEmail", contact.primaryEmail))
        .first();

      const contactData = {
        primaryEmail: contact.primaryEmail,
        name: contact.name,
        emails: ("emails" in contact ? contact.emails : undefined) as string[] | undefined,
        company: contact.company,
        title: contact.title,
        avatarUrl: ("avatarUrl" in contact ? contact.avatarUrl : undefined) as string | undefined,
        notes: ("notes" in contact ? contact.notes : undefined) as string | undefined,
        tags: contact.tags,
        lastContactedAt: contact.lastContactedAt,
        createdAt: now,
        updatedAt: now,
      };

      if (existing) {
        // Update existing contact (preserve existing fields, update demo fields)
        await ctx.db.patch(existing._id, {
          ...contactData,
          createdAt: existing.createdAt, // Preserve original creation time
        });
        insertedIds.push(existing._id);
      } else {
        // Insert new contact
        const id = await ctx.db.insert("contacts", contactData);
        insertedIds.push(id);
      }
    }

    return {
      success: true,
      count: insertedIds.length,
      message: `Seeded ${insertedIds.length} demo contacts`,
    };
  },
});

/**
 * Clear all demo data (emails and contacts)
 * 
 * WARNING: This deletes ALL emails and contacts, not just demo ones.
 * Only works when DEMO_MODE is enabled.
 */
export const clearDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    // Delete all emails
    const allEmails = await ctx.db.query("emails").collect();
    for (const email of allEmails) {
      await ctx.db.delete(email._id);
    }

    // Delete all contacts
    const allContacts = await ctx.db.query("contacts").collect();
    for (const contact of allContacts) {
      await ctx.db.delete(contact._id);
    }

    return {
      success: true,
      emailsDeleted: allEmails.length,
      contactsDeleted: allContacts.length,
      message: `Cleared ${allEmails.length} emails and ${allContacts.length} contacts`,
    };
  },
});

/**
 * Add a single demo email (for testing/manual injection)
 * 
 * Only works when DEMO_MODE is enabled
 */
export const addDemoEmail = internalMutation({
  args: {
    from: v.string(),
    to: v.optional(v.string()),
    cc: v.optional(v.string()),
    bcc: v.optional(v.string()),
    subject: v.string(),
    preview: v.string(),
    body: v.string(),
    read: v.optional(v.boolean()),
    starred: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
    trashed: v.optional(v.boolean()),
    draft: v.optional(v.boolean()),
    sent: v.optional(v.boolean()),
    receivedAt: v.optional(v.number()),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    category: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.array(v.string())),
    replyTo: v.optional(v.string()),
    rawHeaders: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    const emailData = {
      from: args.from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      preview: args.preview,
      body: args.body,
      read: args.read ?? false,
      starred: args.starred ?? false,
      archived: args.archived,
      trashed: args.trashed,
      draft: args.draft,
      sent: args.sent,
      receivedAt: args.receivedAt ?? Date.now(),
      messageId: args.messageId,
      threadId: args.threadId,
      category: args.category,
      inReplyTo: args.inReplyTo,
      references: args.references,
      replyTo: args.replyTo,
      rawHeaders: args.rawHeaders,
    };

    const id = await ctx.db.insert("emails", emailData);
    return { success: true, id };
  },
});
