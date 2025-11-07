import { action, mutation, query, internalMutation, internalAction } from "./_generated/server"
import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import type { Id, Doc } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { 
  sendEmailSchema, 
  saveDraftSchema, 
  storeSentEmailSchema,
  emailIdSchema,
  getContactEmailsSchema 
} from "@/lib/schemas"
import { logError, logWarning, logInfo } from "@/lib/logger"

// Helper to check if field is false or undefined (for backward compatibility)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isFalseOrUndef = (q: any, field: string) => 
  q.or(q.eq(q.field(field), false), q.eq(q.field(field), undefined))

// Helper to normalize message ID (strip angle brackets and trim)
const normalizeMessageId = (msgId: string | undefined | null): string | undefined => {
  if (!msgId) return undefined
  return msgId.trim().replace(/^<|>$/g, "")
}

// Helper to compute stable threadId from message headers
const computeThreadId = ({
  messageId,
  inReplyTo,
  references,
  subject,
}: {
  messageId?: string
  inReplyTo?: string
  references?: string[]
  subject?: string
}): string => {
  // If references exist, use the first one (root of thread)
  if (references && references.length > 0) {
    return normalizeMessageId(references[0]) || ""
  }
  
  // If in-reply-to exists, use it
  if (inReplyTo) {
    return normalizeMessageId(inReplyTo) || ""
  }
  
  // Otherwise use this message's ID as the thread root
  if (messageId) {
    return normalizeMessageId(messageId) || ""
  }
  
  // Fallback to subject fingerprint (strip Re:, Fwd:, normalize whitespace)
  if (subject) {
    return subject
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  }
  
  return ""
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    // Pagination strategy: Currently returns first 100 emails.
    // Future enhancement: Add cursor-based pagination with continueCursor/paginate()
    // to support infinite scrolling and lazy loading of older emails.
    return await ctx.db
      .query("emails")
      .withIndex("by_receivedAt")
      .order("desc")
      .filter((q) => isFalseOrUndef(q, "archived"))
      .filter((q) => isFalseOrUndef(q, "trashed"))
      .filter((q) => isFalseOrUndef(q, "draft"))
      .filter((q) => isFalseOrUndef(q, "sent"))
      .take(100)
  },
})

export const listDrafts = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_draft")
      .order("desc")
      .filter((q) => q.eq(q.field("draft"), true))
      .take(100)
  },
})

export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_archived")
      .order("desc")
      .filter((q) => q.eq(q.field("archived"), true))
      .take(100)
  },
})

export const listSent = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_receivedAt")
      .order("desc")
      .filter((q) => q.eq(q.field("sent"), true))
      .take(100)
  },
})

export const listStarred = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_receivedAt")
      .order("desc")
      .filter((q) => q.eq(q.field("starred"), true))
      .filter((q) => isFalseOrUndef(q, "trashed"))
      .filter((q) => isFalseOrUndef(q, "draft"))
      .take(100)
  },
})

export const contacts = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    // Get all unique email addresses from sent emails
    const sentEmails = await ctx.db
      .query("emails")
      .filter((q) => q.eq(q.field("sent"), true))
      .filter((q) => isFalseOrUndef(q, "trashed"))
      .collect()

    const contactMap = new Map<string, { address: string; name?: string; lastSeen: number; count: number }>()

    for (const email of sentEmails) {
      const recipients = new Set<string>();
      
      const toEmails = email.to?.split(',').map(e => e.trim()).filter(Boolean) || [];
      const ccEmails = email.cc?.split(',').map(e => e.trim()).filter(Boolean) || [];
      
      [...toEmails, ...ccEmails].forEach(emailAddr => recipients.add(emailAddr));
      
      for (const address of recipients) {
        const existing = contactMap.get(address)
        if (existing) {
          existing.count++
          existing.lastSeen = Math.max(existing.lastSeen, email.receivedAt)
        } else {
          contactMap.set(address, {
            address,
            name: undefined,
            lastSeen: email.receivedAt,
            count: 1,
          })
        }
      }
    }

    return Array.from(contactMap.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  },
})

export const listTrashed = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.db
      .query("emails")
      .withIndex("by_trashed")
      .order("desc")
      .filter((q) => q.eq(q.field("trashed"), true))
      .take(100)
  },
})

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    // Use by_read index for fast filtering on read status
    // Only count incoming emails (exclude sent emails and drafts)
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_read")
      .filter((q) => q.eq(q.field("read"), false))
      .filter((q) => isFalseOrUndef(q, "archived"))
      .filter((q) => isFalseOrUndef(q, "trashed"))
      .filter((q) => isFalseOrUndef(q, "sent")) // Exclude sent emails
      .filter((q) => isFalseOrUndef(q, "draft")) // Exclude drafts
      .collect()
    return emails.length
  },
})

export const getById = query({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    return await ctx.db.get(id)
  },
})

// Helper to normalize email (lowercase, trim)
const normalizeEmail = (email: string): string => {
  const trimmed = email.trim()
  const angleMatch = trimmed.match(/<([^>]+)>/)
  const extracted = angleMatch?.[1] ?? trimmed.replace(/^"+|"+$/g, "")
  return extracted.trim().toLowerCase()
}

// Helper to extract all email addresses from a comma-separated string
const extractEmailsFromString = (emailString: string): string[] => {
  if (!emailString) return []
  return Array.from(
    new Set(
      emailString
        .split(",")
        .map((addr) => {
          const match = addr.match(/<([^>]+)>/) || [null, addr.trim()]
          return normalizeEmail(match[1] || addr.trim())
        })
        .filter((email) => email.length > 0)
    )
  )
}

export const getContactEmails = query({
  args: {
    contactId: v.id("contacts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { contactId, cursor } = getContactEmailsSchema.parse(args);
    
    // Get the contact to find all its email addresses
    const contact = await ctx.db.get(contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
    
    // Collect all email addresses for this contact (primaryEmail + emails array)
    const contactEmails = new Set<string>();
    contactEmails.add(normalizeEmail(contact.primaryEmail));
    if (contact.emails) {
      contact.emails.forEach((email) => contactEmails.add(normalizeEmail(email)));
    }
    
    // Use paginate() for cursor-based pagination
    const result = await ctx.db
      .query("emails")
      .withIndex("by_receivedAt")
      .order("desc")
      .paginate({
        cursor: cursor ?? null,
        numItems: 50,
      });
    
    // Filter emails where contact appears in from/to/cc/bcc fields
    const filteredEmails = result.page.filter((email) => {
      // Check from field
      if (email.from) {
        const fromNormalized = normalizeEmail(email.from);
        if (contactEmails.has(fromNormalized)) {
          return true;
        }
      }
      
      // Check to field
      if (email.to) {
        const toEmails = extractEmailsFromString(email.to);
        if (toEmails.some((addr) => contactEmails.has(addr))) {
          return true;
        }
      }
      
      // Check cc field
      if (email.cc) {
        const ccEmails = extractEmailsFromString(email.cc);
        if (ccEmails.some((addr) => contactEmails.has(addr))) {
          return true;
        }
      }
      
      // Check bcc field
      if (email.bcc) {
        const bccEmails = extractEmailsFromString(email.bcc);
        if (bccEmails.some((addr) => contactEmails.has(addr))) {
          return true;
        }
      }
      
      return false;
    });
    
    return {
      page: filteredEmails,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
})

export const upsertFromInbound = internalMutation({
  args: {
    payload: v.any(),
  },
  handler: async (ctx, { payload }) => {
    // Parse provider payloads (support multiple wrappers):
    // - Resend: payload.data
    // - inbound.new (nested): payload.email
    // - Some providers: payload.payload or payload.payload.email
    // - Legacy/flat: payload
    const data = payload?.data 
      || payload?.email 
      || payload?.payload?.email 
      || payload?.payload 
      || payload

    // Helper: normalize recipient lists across shapes
    const toCsv = (input: unknown): string => {
      if (!input) return ""
      if (typeof input === "string") return input
      if (Array.isArray(input)) {
        return input
          .map((v) => {
            if (!v) return ""
            if (typeof v === "string") return v
            if (typeof v === "object") {
              const obj = v as Record<string, unknown>
              // Common shapes: { text }, { address }, Gmail-like { value: [{ address }] }
              if (typeof obj.text === "string") return obj.text
              if (typeof obj.address === "string") return obj.address
              if (Array.isArray(obj.value)) {
                return (obj.value as Array<{ address?: string; name?: string }>)
                  .map((it) => it?.address || "")
                  .filter(Boolean)
                  .join(", ")
              }
            }
            return ""
          })
          .filter(Boolean)
          .join(", ")
      }
      if (typeof input === "object") {
        const obj = input as Record<string, unknown>
        if (typeof obj.text === "string") return obj.text
        if (typeof obj.address === "string") return obj.address
        if (Array.isArray(obj.value)) {
          return (obj.value as Array<{ address?: string; name?: string }>)
            .map((it) => it?.address || "")
            .filter(Boolean)
            .join(", ")
        }
      }
      return ""
    }

    // Extract email data from webhook payload
    // Support string or object shapes (e.g., inbound.new { from: { text } })
    const fromObj = typeof data?.from === "object" && data?.from !== null ? data.from : undefined
    const from = data?.envelope?.from 
      || (typeof data?.from === "string" ? data.from : fromObj?.text || fromObj?.address)
      || ""
    
    // Handle arrays for to/cc/bcc - join with ", " to create CSV strings
    const toVal = data?.to
    const to = data?.envelope?.to || toCsv(toVal)
    
    const ccRaw = data?.cc
    const ccCsv = toCsv(ccRaw)
    const cc = ccCsv.length > 0 ? ccCsv : undefined
    
    const bccRaw = data?.bcc
    const bccCsv = toCsv(bccRaw)
    const bcc = bccCsv.length > 0 ? bccCsv : undefined
    
    // Subject from field or headers fallback
    // Normalize headers to lowercase for case-insensitive access
    const headersRaw = (data?.headers || {}) as Record<string, string | string[]>
    const headers = Object.fromEntries(
      Object.entries(headersRaw).map(([k, v]) => [k.toLowerCase(), v])
    ) as Record<string, string | string[]>

    const subject = data?.subject || (headers["subject"] as string | undefined) || ""
    
    // Helper for header access
    const getHeader = (key: string): string | undefined => {
      const val = headers[key.toLowerCase()]
      return Array.isArray(val) ? val[0] : val
    }
    
    const messageId = normalizeMessageId(
      getHeader("message-id")
        || getHeader("messageid")
        || data?.message_id
        || data?.messageId
        || data?.id
    ) || ""
    
    const inReplyTo = normalizeMessageId(
      getHeader("in-reply-to") || data?.in_reply_to || data?.inReplyTo
    )
    
    const replyTo = getHeader("reply-to") || data?.reply_to || (typeof data?.replyTo === "string" ? data.replyTo : undefined)
    
    // Parse references header (can be space-separated string or array)
    const referencesRaw = getHeader("references") || data?.references
    const references = Array.isArray(referencesRaw)
      ? referencesRaw.map(normalizeMessageId).filter((r): r is string => !!r)
      : typeof referencesRaw === "string"
      ? referencesRaw.split(/\s+/).map(normalizeMessageId).filter((r): r is string => !!r)
      : []
    
    // Cap references at 50 to prevent unbounded growth
    const cappedReferences = references.slice(-50)
    
    // Compute stable threadId
    const threadId = computeThreadId({
      messageId,
      inReplyTo,
      references: cappedReferences,
      subject,
    })
    
    // Store raw headers as JSON for debugging/future use
    const rawHeaders = Object.keys(headers).length > 0 
      ? JSON.stringify(headers)
      : undefined
    
    // Set receivedAt from created_at or date field if present
    const receivedAt = data?.created_at 
      ? new Date(data.created_at).getTime()
      : (data?.date ? new Date(data.date).getTime()
        : (data?.receivedAt ? new Date(data.receivedAt).getTime()
          : (getHeader("date") ? new Date(getHeader("date") as string).getTime() : Date.now())))

    // Extract body from payload if available (html or text)
    // Support inbound.new cleanedContent { html, text }
    const cleaned = typeof data?.cleanedContent === "object" && data.cleanedContent ? data.cleanedContent as { html?: string; text?: string } : undefined
    const altCleanHtml = (data?.clean_html as string | undefined) || (data?.cleanHtml as string | undefined)
    const altCleanText = (data?.clean_text as string | undefined) || (data?.cleanText as string | undefined)
    const body = data?.html || data?.text || cleaned?.html || cleaned?.text || altCleanHtml || altCleanText || ""

    // Fallback: derive from header fields if top-level empty
    const headerFrom = getHeader("from")
    const headerTo = getHeader("to")
    const computedFrom = from || headerFrom || ""
    const computedTo = to || headerTo || ""
    
    // Create a preview from text, body, or subject
    const previewText = data?.text || body || subject
    const preview = previewText.length > 100 ? previewText.substring(0, 100) + "..." : previewText

    // Check if messageId already exists before inserting (idempotency)
    if (messageId) {
      const existing = await ctx.db
        .query("emails")
        .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
        .first()
      
      if (existing) {
        // Update the existing record instead of inserting
        await ctx.db.patch(existing._id, {
          from: computedFrom,
          to: computedTo,
          cc,
          bcc,
          subject,
          preview,
          body,
          receivedAt,
          inReplyTo,
          references: cappedReferences,
          replyTo,
          rawHeaders,
          threadId,
        })
        return existing._id
      }
    }

    // Insert the email record
    const docId = await ctx.db.insert("emails", {
      from: computedFrom,
      to: computedTo,
      cc,
      bcc,
      subject,
      preview,
      body,
      read: false,
      starred: false,
      archived: false,
      trashed: false,
      draft: false,
      sent: false,
      receivedAt,
      messageId,
      inReplyTo,
      references: cappedReferences,
      replyTo,
      rawHeaders,
      threadId,
    })

    // Upsert contacts from email participants
    const extractNameFromEmailString = (emailString: string): string | undefined => {
      const match = emailString.match(/^(.+?)\s*<(.+)>$/)
      if (match && match[1]) {
        return match[1].trim()
      }
      return undefined
    }

    const normalizeEmail = (email: string): string => {
      return email.trim().toLowerCase()
    }

    const extractEmailsFromString = (emailString: string): string[] => {
      return emailString
        .split(",")
        .map((addr) => {
          const match = addr.match(/<([^>]+)>/) || [null, addr.trim()]
          return normalizeEmail(match[1] || addr.trim())
        })
        .filter((email) => email.length > 0)
    }

    // Process 'from' field
    if (computedFrom) {
      const fromNormalized = normalizeEmail(computedFrom)
      const name = extractNameFromEmailString(from)
      await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
        email: fromNormalized,
        name,
      })
      await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
        email: fromNormalized,
        ts: receivedAt,
      })
    }

    // Process 'to' field
    if (computedTo) {
      const toEmails = extractEmailsFromString(computedTo)
      for (const addr of toEmails) {
        await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
          email: addr,
        })
        await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
          email: addr,
          ts: receivedAt,
        })
      }
    }

    // Process 'cc' field
    if (cc) {
      const ccEmails = extractEmailsFromString(cc)
      for (const addr of ccEmails) {
        await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
          email: addr,
        })
        await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
          email: addr,
          ts: receivedAt,
        })
      }
    }

    return docId
  },
})

/**
 * Fetch full email body from Resend API (for webhook payloads without body)
 * 
 * RETRY STRATEGY (handle transient failures):
 * - Max attempts: 3
 * - Retry on: 404 (not ready), 429 (rate limit), 5xx (server error)
 * - Backoff: 5s, 10s, 15s (linear with 15s cap)
 * - Timeout: 30 seconds per attempt (Convex action limit)
 * 
 * Triggered by: upsertFromInbound when payload lacks html/text fields
 */
export const fetchEmailBodyFromResend = internalAction({
  args: {
    docId: v.id("emails"),
    emailId: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, { docId, emailId, attempt }) => {
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      logError("RESEND_API_KEY not configured", {
        action: "fetch_email_body",
        emailId: emailId,
      })
      return
    }

    try {
      // Fetch email details from Resend API
      const response = await fetch(`https://api.resend.com/emails/${emailId}`, {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
        },
      })

      if (!response.ok) {
        logWarning("Failed to fetch email body from Resend API", {
          action: "fetch_email_body",
          emailId: emailId,
          metadata: { status: response.status, attempt },
        })
        // Retry on 404, 429, and 5xx errors
        const shouldRetry = response.status === 404 || response.status === 429 || (response.status >= 500 && response.status < 600)
        if (shouldRetry && attempt < 3) {
          const delayMs = Math.min(15000, attempt * 5000)
          await ctx.scheduler.runAfter(delayMs, internal.emails.fetchEmailBodyFromResend, {
            docId,
            emailId,
            attempt: attempt + 1,
          })
        }
        return
      }

      const emailData = await response.json()

      // Update the email with the full body content
      await ctx.runMutation(internal.emails.updateBody, {
        docId,
        body: emailData.html || emailData.text || "",
      })

    } catch (error) {
      logError("Error fetching Resend email body", {
        action: "fetch_email_body",
        emailId: emailId,
        metadata: { error: String(error), attempt },
      })
      // If we haven't exceeded max attempts, retry
      if (attempt < 3) {
        const delayMs = Math.min(15000, attempt * 5000)
        await ctx.scheduler.runAfter(delayMs, internal.emails.fetchEmailBodyFromResend, {
          docId,
          emailId,
          attempt: attempt + 1,
        })
      }
    }
  },
})

export const updateBody = internalMutation({
  args: {
    docId: v.id("emails"),
    body: v.string(),
  },
  handler: async (ctx, { docId, body }) => {
    await ctx.db.patch(docId, { body })
  },
})

export const toggleStar = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    const email = await ctx.db.get(id)
    if (!email) throw new Error("Email not found")
    // Type assertion: we know this is an email because we fetched by email ID
    const emailDoc = email as Doc<"emails">
    await ctx.db.patch(id, { starred: !emailDoc.starred })
  },
})

export const toggleArchive = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    const email = await ctx.db.get(id)
    if (!email) throw new Error("Email not found")
    // Type assertion: we know this is an email because we fetched by email ID
    const emailDoc = email as Doc<"emails">

    const nextArchivedValue = !(emailDoc.archived ?? false)

    if (emailDoc.threadId) {
      const threadEmails = await ctx.db
        .query("emails")
        .withIndex("by_threadId", (q) => q.eq("threadId", emailDoc.threadId!))
        .collect()

      if (threadEmails.length > 0) {
        for (const threadEmail of threadEmails) {
          await ctx.db.patch(threadEmail._id, { archived: nextArchivedValue })
        }
        return
      }
    }

    await ctx.db.patch(id, { archived: nextArchivedValue })
  },
})

export const toggleTrash = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    const email = await ctx.db.get(id)
    if (!email) throw new Error("Email not found")
    // Type assertion: we know this is an email because we fetched by email ID
    const emailDoc = email as Doc<"emails">

    const nextTrashedValue = !(emailDoc.trashed ?? false)

    if (emailDoc.threadId) {
      const threadEmails = await ctx.db
        .query("emails")
        .withIndex("by_threadId", (q) => q.eq("threadId", emailDoc.threadId!))
        .collect()

      if (threadEmails.length > 0) {
        for (const threadEmail of threadEmails) {
          await ctx.db.patch(threadEmail._id, { trashed: nextTrashedValue })
        }
        return
      }
    }

    await ctx.db.patch(id, { trashed: nextTrashedValue })
  },
})

export const markRead = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    await ctx.db.patch(id, { read: true })
  },
})

export const deleteEmail = mutation({
  args: { id: v.id("emails") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id } = emailIdSchema.parse(args);
    await ctx.db.delete(id)
  },
})

// Alias for backward compatibility
export const deleteDraft = deleteEmail

export const storeSentEmail = mutation({
  args: {
    from: v.string(),
    to: v.string(),
    cc: v.optional(v.string()),
    bcc: v.optional(v.string()),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    messageId: v.string(),
    originalEmailId: v.optional(v.id("emails")),
    originalEmail: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { from, to, cc, bcc, subject, html, text, messageId, originalEmailId, originalEmail } = storeSentEmailSchema.parse(args);
    
    // Compute threading fields if this is a reply
    let threadId: string | undefined
    let inReplyTo: string | undefined
    let references: string[] | undefined
    
    if (originalEmail && originalEmailId) {
      inReplyTo = originalEmail.messageId
      references = [
        ...(originalEmail.references || []),
        originalEmail.messageId,
      ].filter((ref): ref is string => typeof ref === 'string').slice(-50)
      
      // Use original's threadId if available
      threadId = originalEmail.threadId
    } else {
      // New message - use this message's ID as the thread root
      threadId = normalizeMessageId(messageId)
    }
    
    const docId = await ctx.db.insert("emails", {
      from,
      to,
      cc,
      bcc,
      subject,
      preview: text.length > 100 ? text.substring(0, 100) + "..." : text,
      body: html,
      read: true,
      starred: false,
      archived: false,
      trashed: false,
      draft: false,
      sent: true,
      receivedAt: Date.now(),
      messageId: normalizeMessageId(messageId),
      threadId,
      inReplyTo,
      references,
    })

    // Upsert contacts from email participants
    const extractNameFromEmailString = (emailString: string): string | undefined => {
      const match = emailString.match(/^(.+?)\s*<(.+)>$/)
      if (match && match[1]) {
        return match[1].trim()
      }
      return undefined
    }

    const normalizeEmail = (email: string): string => {
      return email.trim().toLowerCase()
    }

    const extractEmailsFromString = (emailString: string): string[] => {
      return emailString
        .split(",")
        .map((addr) => {
          const match = addr.match(/<([^>]+)>/) || [null, addr.trim()]
          return normalizeEmail(match[1] || addr.trim())
        })
        .filter((email) => email.length > 0)
    }

    const receivedAt = Date.now()

    // Process 'to' field
    if (to) {
      const toEmails = extractEmailsFromString(to)
      for (const addr of toEmails) {
        await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
          email: addr,
        })
        await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
          email: addr,
          ts: receivedAt,
        })
      }
    }

    // Process 'cc' field
    if (cc) {
      const ccEmails = extractEmailsFromString(cc)
      for (const addr of ccEmails) {
        await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
          email: addr,
        })
        await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
          email: addr,
          ts: receivedAt,
        })
      }
    }

    // Process 'bcc' field
    if (bcc) {
      const bccEmails = extractEmailsFromString(bcc)
      for (const addr of bccEmails) {
        await ctx.scheduler.runAfter(0, internal.contacts.upsertContactFromEmail, {
          email: addr,
        })
        await ctx.scheduler.runAfter(0, internal.contacts.touchLastContactedInternal, {
          email: addr,
          ts: receivedAt,
        })
      }
    }

    return docId
  },
})

/**
 * Send an email via Resend or inbound.new
 * 
 * LIMITS (prevent abuse and ensure deliverability):
 * - Max recipients: 100 total across to/cc/bcc fields
 * - Max body size: 1MB (HTML + text combined)
 * - Max subject length: 500 characters
 * - Timeout: 30 seconds (enforced by Convex action limit)
 * 
 * To adjust limits, modify validation below.
 */
export const sendEmail = action({
  args: {
    from: v.string(),
    to: v.string(),
    cc: v.optional(v.string()),
    bcc: v.optional(v.string()),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    originalEmailId: v.optional(v.id("emails")),
    draftId: v.optional(v.id("emails")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId: string; docId: Id<"emails"> }> => {
    await requireUserId(ctx);
    const { from, to, cc, bcc, subject, html, text, originalEmailId, draftId } = sendEmailSchema.parse(args);
    
    // DEMO MODE: Mock email sending if demo mode is enabled
    const isDemoMode = process.env.DEMO_MODE === "true";
    
    if (isDemoMode) {
      // Generate fake messageId for demo
      const demoMessageId = `demo-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      
      // Fetch original email to build threading headers if replying
      let threadingHeaders: Record<string, string> | undefined;
      let originalEmail: Doc<"emails"> | null = null;
      if (originalEmailId) {
        const fetchedEmail = await ctx.runQuery(api.emails.getById, { id: originalEmailId });
        if (fetchedEmail) {
          originalEmail = fetchedEmail as Doc<"emails">;
          const inReplyTo = originalEmail.messageId;
          const newReferences = [
            ...(originalEmail.references || []),
            originalEmail.messageId,
          ].filter((ref): ref is string => typeof ref === 'string').slice(-50);
          
          if (inReplyTo) {
            threadingHeaders = {
              "In-Reply-To": `<${inReplyTo}>`,
              "References": newReferences.map((ref: string) => `<${ref}>`).join(" "),
            };
          }
        }
      }
      
      // Store the sent email record (mock send - no actual API call)
      const docId = await ctx.runMutation(api.emails.storeSentEmail, {
        from,
        to,
        cc,
        bcc,
        subject,
        html,
        text,
        messageId: demoMessageId,
        originalEmailId,
        originalEmail: originalEmail ? {
          messageId: originalEmail.messageId,
          threadId: originalEmail.threadId,
          references: originalEmail.references,
        } : null,
      });
      
      // If this was from a draft, delete the draft
      if (draftId) {
        await ctx.runMutation(api.emails.deleteEmail, { id: draftId });
      }
      
      logInfo("Demo mode: Email mock-sent (not actually sent)", {
        action: "send_email_demo",
        metadata: { messageId: demoMessageId, to },
      });
      
      return { success: true, messageId: demoMessageId, docId };
    }
    
    // Enforce sending limits (prevent abuse)
    const MAX_RECIPIENTS = 100;
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB
    const MAX_SUBJECT_LENGTH = 500;
    
    // Validate recipient count
    const toCount = to.split(',').filter((e: string) => e.trim()).length;
    const ccCount = cc ? cc.split(',').filter((e: string) => e.trim()).length : 0;
    const bccCount = bcc ? bcc.split(',').filter((e: string) => e.trim()).length : 0;
    const totalRecipients = toCount + ccCount + bccCount;
    
    if (totalRecipients > MAX_RECIPIENTS) {
      throw new Error(`Too many recipients: ${totalRecipients} (max: ${MAX_RECIPIENTS})`);
    }
    
    // Validate body size (HTML + text)
    const bodySize = (html?.length || 0) + (text?.length || 0);
    if (bodySize > MAX_BODY_SIZE) {
      throw new Error(`Email body too large: ${Math.round(bodySize / 1024)}KB (max: ${MAX_BODY_SIZE / 1024}KB)`);
    }
    
    // Validate subject length
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw new Error(`Subject too long: ${subject.length} characters (max: ${MAX_SUBJECT_LENGTH})`);
    }
    const resendApiKey = process.env.RESEND_API_KEY
    const inboundApiKey = process.env.NEXT_INBOUND_API_KEY
    
    if (!resendApiKey && !inboundApiKey) {
      throw new Error("No email provider configured. Set RESEND_API_KEY or NEXT_INBOUND_API_KEY")
    }

    // Fetch original email to build threading headers if replying
    let threadingHeaders: Record<string, string> | undefined
    let originalEmail: Doc<"emails"> | null = null
    if (originalEmailId) {
      const fetchedEmail = await ctx.runQuery(api.emails.getById, { id: originalEmailId })
      if (fetchedEmail) {
        // Type assertion: getById returns an email document
        originalEmail = fetchedEmail as Doc<"emails">
        const inReplyTo = originalEmail.messageId
        // Build references array: original's references + original's messageId
        const newReferences = [
          ...(originalEmail.references || []),
          originalEmail.messageId,
        ].filter((ref): ref is string => typeof ref === 'string').slice(-50)
        
        if (inReplyTo) {
          threadingHeaders = {
            "In-Reply-To": `<${inReplyTo}>`,
            "References": newReferences.map((ref: string) => `<${ref}>`).join(" "),
          }
        }
      }
    }

    let messageId: string | undefined
    let sendError: Error | null = null

    // Try Resend first if available
    if (resendApiKey) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from,
            to: [to],
            cc: cc ? [cc] : undefined,
            bcc: bcc ? [bcc] : undefined,
            subject,
            html,
            text,
            headers: threadingHeaders,
          }),
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`Resend API error: ${error}`)
        }

        const result = await response.json()
        messageId = result.id
      } catch (error) {
        sendError = error as Error
        logWarning("Resend email send failed, will try fallback", {
          action: "send_email",
          metadata: { error: String(error), hasFallback: !!inboundApiKey },
        })
        
        // If inbound.new is not available, throw the error
        if (!inboundApiKey) {
          throw new Error(`Failed to send email via Resend: ${sendError.message}`)
        }
      }
    }

    // Try inbound.new if Resend failed or wasn't available
    if (!messageId && inboundApiKey) {
      try {
        const { Inbound } = await import("@inboundemail/sdk")
        const inbound = new Inbound(inboundApiKey)

        const result = await inbound.send({
          from,
          to,
          cc,
          bcc,
          subject,
          html,
          text,
          ...(threadingHeaders ? { headers: threadingHeaders } : {}),
        }) as { messageId?: string; id?: string }

        messageId = result.messageId || result.id || `inbound-${Date.now()}`
      } catch (error) {
        const inboundError = error as Error
        logError("inbound.new email send failed", {
          action: "send_email",
          metadata: { error: String(error), hadResendFallback: !!sendError },
        })
        
        // If both providers failed, throw combined error
        if (sendError) {
          throw new Error(`Failed to send email. Resend: ${sendError.message}. inbound.new: ${inboundError.message}`)
        } else {
          throw new Error(`Failed to send email via inbound.new: ${inboundError.message}`)
        }
      }
    }

    if (!messageId) {
      throw new Error("Failed to send email via any provider")
    }

    // Store the sent email record
    const docId = await ctx.runMutation(api.emails.storeSentEmail, {
      from,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
      messageId,
      originalEmailId,
      originalEmail: originalEmail ? {
        messageId: originalEmail.messageId,
        threadId: originalEmail.threadId,
        references: originalEmail.references,
      } : null,
    })

    // If this was from a draft, delete the draft
    if (draftId) {
      await ctx.runMutation(api.emails.deleteEmail, { id: draftId })
    }

    return { success: true, messageId, docId }
  },
})

/**
 * Save a draft email (create or update)
 * 
 * LIMITS (prevent unbounded storage growth):
 * - Max body size: 1MB (HTML content)
 * - Max subject length: 500 characters
 * - Called via auto-save with 800ms debounce
 * 
 * To adjust limits, modify validation below.
 */
export const saveDraft = mutation({
  args: {
    id: v.optional(v.id("emails")),
    from: v.string(),
    to: v.optional(v.string()),
    cc: v.optional(v.string()),
    bcc: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const { id, from, to, cc, bcc, subject, body, threadId } = saveDraftSchema.parse(args);
    
    // Enforce draft size limits (prevent storage abuse)
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB
    const MAX_SUBJECT_LENGTH = 500;
    
    if (body.length > MAX_BODY_SIZE) {
      throw new Error(`Draft body too large: ${Math.round(body.length / 1024)}KB (max: ${MAX_BODY_SIZE / 1024}KB)`);
    }
    
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw new Error(`Subject too long: ${subject.length} characters (max: ${MAX_SUBJECT_LENGTH})`);
    }
    const timestamp = Date.now()
    const preview = body.length > 100 ? body.substring(0, 100) + "..." : body

    if (id) {
      await ctx.db.patch(id, {
        from,
        to,
        cc,
        bcc,
        subject,
        preview,
        body,
        threadId,
        receivedAt: timestamp,
      })
      return id
    }

    return await ctx.db.insert("emails", {
      from,
      to,
      cc,
      bcc,
      subject,
      preview,
      body,
      threadId,
      read: true,
      starred: false,
      archived: false,
      trashed: false,
      draft: true,
      sent: false,
      receivedAt: timestamp,
    })
  },
})

export const backfillThreadIds = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize = 100 }) => {
    const emails = await ctx.db
      .query("emails")
      .collect()
      .then(emails => emails.slice(0, batchSize))
    
    let updated = 0
    
    for (const email of emails) {
      // Skip if threadId already looks valid (not a Convex ID format)
      if (email.threadId && !email.threadId.startsWith("j") && email.threadId.length > 20) {
        continue
      }
      
      // Compute new threadId based on existing fields
      const newThreadId = computeThreadId({
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        subject: email.subject,
      })
      
      // Only update if we computed a different threadId
      if (newThreadId && newThreadId !== email.threadId) {
        await ctx.db.patch(email._id, {
          threadId: newThreadId,
          // Ensure references is an array if it exists
          references: email.references || undefined,
        })
        updated++
      }
    }
    
    return { processed: emails.length, updated }
  },
})
