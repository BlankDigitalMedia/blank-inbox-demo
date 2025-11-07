import { query, mutation, action, internalMutation } from "./_generated/server"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import type { Id, Doc } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import {
  listContactsSchema,
  getContactByEmailSchema,
  contactIdSchema,
  upsertContactSchema,
  updateContactSchema,
  mergeContactsSchema,
  touchLastContactedSchema,
  deleteContactSchema,
  updateEnrichmentSchema,
} from "@/lib/schemas"

// Helper to normalize email (lowercase, trim)
const normalizeEmail = (email: string): string => {
  const trimmed = email.trim()
  const angleMatch = trimmed.match(/<([^>]+)>/)
  const extracted = angleMatch?.[1] ?? trimmed.replace(/^"+|"+$/g, "")
  return extracted.trim().toLowerCase()
}

// Helper to extract name from email string (e.g., "John Doe <john@example.com>" -> "John Doe")
const extractNameFromEmailString = (emailString: string): string | undefined => {
  const match = emailString.match(/^(.+?)\s*<(.+)>$/)
  if (match && match[1]) {
    return match[1].trim()
  }
  return undefined
}

// Helper to extract all email addresses from a comma-separated string
const extractEmailsFromString = (emailString: string): string[] => {
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

// Helper to find a contact by any email (primaryEmail or emails array)
// Checks primaryEmail first (indexed, fast), then scans emails array if needed
async function findContactByAnyEmail(
  ctx: any,
  normalizedEmail: string
): Promise<Doc<"contacts"> | null> {
  // Check primaryEmail first (indexed, fast)
  const byPrimary = await ctx.db
    .query("contacts")
    .withIndex("by_primaryEmail", (q: any) => q.eq("primaryEmail", normalizedEmail))
    .first()
  if (byPrimary) return byPrimary

  // Check emails array (scan required, but necessary for deduplication)
  const allContacts = await ctx.db.query("contacts").collect()
  return (
    allContacts.find((c: Doc<"contacts">) => c.emails?.some((email) => normalizeEmail(email) === normalizedEmail) || normalizeEmail(c.primaryEmail) === normalizedEmail) || null
  )
}

export const listContacts = query({
  args: {
    search: v.optional(v.string()),
    tag: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { search, tag } = listContactsSchema.parse({ search: args.search, tag: args.tag })

    const baseQuery = ctx.db
      .query("contacts")
      .withIndex("by_updatedAt")
      .order("desc")

    const filterContact = (contact: Doc<"contacts">) => {
      if (tag && !contact.tags?.includes(tag)) {
        return false
      }

      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = contact.name?.toLowerCase().includes(searchLower)
        const primaryEmail = contact.primaryEmail
        const primaryMatches =
          primaryEmail.toLowerCase().includes(searchLower) ||
          normalizeEmail(primaryEmail).includes(searchLower)
        const otherEmailsMatch = contact.emails?.some((email) => {
          const normalized = normalizeEmail(email)
          return (
            normalized.includes(searchLower) ||
            email.toLowerCase().includes(searchLower)
          )
        })
        return Boolean(nameMatch || primaryMatches || otherEmailsMatch)
      }

      return true
    }

    const desired = args.paginationOpts.numItems ?? 50
    let cursor = args.paginationOpts.cursor ?? null
    let accumulated: Doc<"contacts">[] = []
    let continueCursor: string | null = null
    let isDone = false
    let firstIteration = true

    while (accumulated.length < desired) {
      const pageResult = await baseQuery.paginate({
        cursor,
        numItems: Math.max(desired - accumulated.length, 1),
      })

      const filtered = pageResult.page.filter(filterContact)
      accumulated = accumulated.concat(filtered)
      continueCursor = pageResult.continueCursor
      isDone = pageResult.isDone || !continueCursor

      if (search || tag) {
        // Keep scanning if we still need more matches and there are more pages
        if (accumulated.length >= desired || !continueCursor) {
          break
        }
        cursor = continueCursor
        firstIteration = false
        continue
      }

      // For non-filtered runs, return immediately after first page
      if (firstIteration) {
        accumulated = filtered
      }
      break
    }

    if (accumulated.length > desired) {
      accumulated = accumulated.slice(0, desired)
    }

    return {
      page: accumulated,
      continueCursor: continueCursor ?? "",
      isDone: isDone || !continueCursor,
    }
  },
})

export const getContactByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { email } = getContactByEmailSchema.parse(args)
    const normalized = normalizeEmail(email)

    const contact = await findContactByAnyEmail(ctx, normalized)

    return contact
  },
})

// Bulk lookup contacts by email addresses
// Returns a map of normalized email -> contact (with id and name)
export const getContactsByEmails = query({
  args: {
    emails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const normalizedEmails = args.emails.map((e) => normalizeEmail(e))
    const emailSet = new Set(normalizedEmails)
    
    // Map to store results: normalized email -> { id, name }
    const result = new Map<string, { id: Id<"contacts">; name?: string }>()
    
    // Query all contacts and filter by emails
    const allContacts = await ctx.db.query("contacts").collect()
    
    for (const contact of allContacts) {
      // Check primaryEmail
      if (emailSet.has(contact.primaryEmail)) {
        result.set(contact.primaryEmail, {
          id: contact._id,
          name: contact.name,
        })
      }
      
      // Check emails array
      if (contact.emails) {
        for (const email of contact.emails) {
          if (emailSet.has(email)) {
            result.set(email, {
              id: contact._id,
              name: contact.name,
            })
          }
        }
      }
    }
    
    return Object.fromEntries(result)
  },
})

export const getContact = query({
  args: {
    id: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { id } = contactIdSchema.parse(args)
    return await ctx.db.get(id)
  },
})

export const upsertContact = mutation({
  args: {
    primaryEmail: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { primaryEmail, name, company, title, avatarUrl, notes, tags } =
      upsertContactSchema.parse(args)

    const normalized = normalizeEmail(primaryEmail)
    const now = Date.now()

    // Check if contact exists (comprehensive lookup)
    const existing = await findContactByAnyEmail(ctx, normalized)

    if (existing) {
      // Update existing contact
      const updatedFields: {
        name?: string
        company?: string
        title?: string
        avatarUrl?: string
        notes?: string
        tags?: string[]
        emails?: string[]
        updatedAt: number
        primaryEmail?: string
      } = {
        updatedAt: now,
      }

      if (name !== undefined) updatedFields.name = name
      if (company !== undefined) updatedFields.company = company
      if (title !== undefined) updatedFields.title = title
      if (avatarUrl !== undefined) updatedFields.avatarUrl = avatarUrl
      if (notes !== undefined) updatedFields.notes = notes
      if (tags !== undefined) updatedFields.tags = tags

      // Ensure email is in emails array if not already present
      const currentEmails = existing.emails ? existing.emails.map(normalizeEmail) : []
      const emailSet = new Set(currentEmails)
      emailSet.add(normalized)
      updatedFields.emails = Array.from(emailSet)

      const primaryNormalized = normalizeEmail(existing.primaryEmail)
      if (primaryNormalized !== existing.primaryEmail || primaryNormalized !== normalized) {
        updatedFields.primaryEmail = normalized
      }

      await ctx.db.patch(existing._id, updatedFields)
      return existing._id
    } else {
      // Create new contact
      const contactId = await ctx.db.insert("contacts", {
        primaryEmail: normalized,
        name,
        emails: [normalized],
        company,
        title,
        avatarUrl,
        notes,
        tags,
        createdAt: now,
        updatedAt: now,
      })
      return contactId
    }
  },
})

export const updateContact = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { id, name, company, title, avatarUrl, notes, tags } =
      updateContactSchema.parse(args)

    const contact = await ctx.db.get(id)
    if (!contact) {
      throw new Error("Contact not found")
    }

    const updatedFields: {
      name?: string
      company?: string
      title?: string
      avatarUrl?: string
      notes?: string
      tags?: string[]
      updatedAt: number
    } = {
      updatedAt: Date.now(),
    }

    if (name !== undefined) updatedFields.name = name
    if (company !== undefined) updatedFields.company = company
    if (title !== undefined) updatedFields.title = title
    if (avatarUrl !== undefined) updatedFields.avatarUrl = avatarUrl
    if (notes !== undefined) updatedFields.notes = notes
    if (tags !== undefined) updatedFields.tags = tags

    await ctx.db.patch(id, updatedFields)
    return id
  },
})

export const mergeContacts = mutation({
  args: {
    sourceId: v.id("contacts"),
    targetId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { sourceId, targetId } = mergeContactsSchema.parse(args)

    const source = await ctx.db.get(sourceId)
    const target = await ctx.db.get(targetId)

    if (!source || !target) {
      throw new Error("One or both contacts not found")
    }

    // Type assertion: we know these are contacts because we fetched by contact ID
    const sourceContact = source as Doc<"contacts">
    const targetContact = target as Doc<"contacts">

    // Merge fields: prefer non-empty values from source if target is empty
    const mergedName = targetContact.name || sourceContact.name
    const mergedCompany = targetContact.company || sourceContact.company
    const mergedTitle = targetContact.title || sourceContact.title
    const mergedAvatarUrl = targetContact.avatarUrl || sourceContact.avatarUrl
    const mergedNotes = targetContact.notes || sourceContact.notes

    // Merge tags (union)
    const mergedTags = Array.from(
      new Set([...(targetContact.tags || []), ...(sourceContact.tags || [])])
    )

    // Merge emails (union)
    const mergedEmails = Array.from(
      new Set([
        ...(targetContact.emails || []),
        ...(sourceContact.emails || []),
        sourceContact.primaryEmail,
      ])
    )

    // Update target with merged data
    await ctx.db.patch(targetId, {
      name: mergedName,
      company: mergedCompany,
      title: mergedTitle,
      avatarUrl: mergedAvatarUrl,
      notes: mergedNotes,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      emails: mergedEmails,
      updatedAt: Date.now(),
    })

    // Delete source
    await ctx.db.delete(sourceId)

    return targetId
  },
})

export const touchLastContacted = mutation({
  args: {
    email: v.string(),
    ts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { email, ts } = touchLastContactedSchema.parse(args)

    const normalized = normalizeEmail(email)
    const timestamp = ts ?? Date.now()

    const contact = await findContactByAnyEmail(ctx, normalized)

    if (contact) {
      await ctx.db.patch(contact._id, {
        lastContactedAt: timestamp,
        updatedAt: Date.now(),
      })
    }
  },
})

export const deleteContact = mutation({
  args: {
    id: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { id } = deleteContactSchema.parse(args)

    const contact = await ctx.db.get(id)
    if (!contact) {
      throw new Error("Contact not found")
    }

    await ctx.db.delete(id)
    return id
  },
})

// Internal mutation for upserting contacts from email addresses
export const upsertContactFromEmail = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { email, name }) => {
    const normalized = normalizeEmail(email)
    const now = Date.now()

    // Check if contact exists (comprehensive lookup)
    let existing = await findContactByAnyEmail(ctx, normalized)

    if (existing) {
      // Update existing contact
      const updates: {
        name?: string
        lastContactedAt: number
        updatedAt: number
        emails?: string[]
        primaryEmail?: string
      } = {
        lastContactedAt: now,
        updatedAt: now,
      }

      if (name && !existing.name) {
        updates.name = name
      }

      // Ensure email is in emails array if not already present
      const originalEmails = existing.emails || []
      const currentEmails = originalEmails.map(normalizeEmail)
      const emailSet = new Set(currentEmails)
      const initialSize = emailSet.size
      emailSet.add(normalized)
      const sanitizedEmails = Array.from(emailSet)
      const needsSync =
        emailSet.size !== initialSize ||
        originalEmails.length !== sanitizedEmails.length ||
        originalEmails.some((email) => normalizeEmail(email) !== email)
      if (needsSync) {
        updates.emails = sanitizedEmails
      }

      const primaryNormalized = normalizeEmail(existing.primaryEmail)
      if (primaryNormalized !== existing.primaryEmail || primaryNormalized !== normalized) {
        updates.primaryEmail = normalized
      }

      await ctx.db.patch(existing._id, updates)
      return existing._id
    } else {
      // Create new contact
      const contactId = await ctx.db.insert("contacts", {
        primaryEmail: normalized,
        name,
        emails: [normalized],
        lastContactedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      // Race condition recovery: check again after insert
      // If another concurrent mutation created a duplicate, clean it up
      // We need to check for multiple contacts with the same email
      const byPrimary = await ctx.db
        .query("contacts")
        .withIndex("by_primaryEmail", (q: any) => q.eq("primaryEmail", normalized))
        .collect()
      
      // Check if there are multiple contacts with this primaryEmail
      if (byPrimary.length > 1) {
        // Find the oldest one (first created) to keep
        const sorted = byPrimary.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        const keepContact = sorted[0]
        
        // If our contact is not the one to keep, delete it and update the kept one
        if (keepContact && keepContact._id !== contactId) {
          await ctx.db.delete(contactId)
          
          // Update the kept contact with our data
          const updates: {
            name?: string
            lastContactedAt: number
            updatedAt: number
            emails?: string[]
            primaryEmail?: string
          } = {
            lastContactedAt: now,
            updatedAt: now,
          }

          if (name && !keepContact.name) {
            updates.name = name
          }

          // Ensure email is in emails array
          const originalEmails = keepContact.emails || []
          const currentEmails = originalEmails.map(normalizeEmail)
          const emailSet = new Set(currentEmails)
          const initialSize = emailSet.size
          emailSet.add(normalized)
          const sanitizedEmails = Array.from(emailSet)
          const needsSync =
            emailSet.size !== initialSize ||
            originalEmails.length !== sanitizedEmails.length ||
            originalEmails.some((email) => normalizeEmail(email) !== email)
          if (needsSync) {
            updates.emails = sanitizedEmails
          }

          const primaryNormalized = normalizeEmail(keepContact.primaryEmail)
          if (primaryNormalized !== keepContact.primaryEmail || primaryNormalized !== normalized) {
            updates.primaryEmail = normalized
          }

          await ctx.db.patch(keepContact._id, updates)
          return keepContact._id
        }
      }

      // Also check if email exists in another contact's emails array
      const allContacts = await ctx.db.query("contacts").collect()
      const contactsWithEmail = allContacts.filter(
        (c: Doc<"contacts">) => 
          c.emails?.includes(normalized) && c._id !== contactId
      )
      
      if (contactsWithEmail.length > 0) {
        // Found duplicate - use the first one found
        const existingContact = contactsWithEmail[0]
        if (!existingContact) {
          // Should never happen, but TypeScript requires this check
          throw new Error("Existing contact not found")
        }
        await ctx.db.delete(contactId)
        
        // Update existing contact
        const updates: {
          name?: string
          lastContactedAt: number
          updatedAt: number
          emails?: string[]
          primaryEmail?: string
        } = {
          lastContactedAt: now,
          updatedAt: now,
        }

        if (name && !existingContact.name) {
          updates.name = name
        }

        // Ensure email is in emails array (should already be, but just in case)
        const originalEmails = existingContact.emails || []
        const currentEmails = originalEmails.map(normalizeEmail)
        const emailSet = new Set(currentEmails)
        const initialSize = emailSet.size
        emailSet.add(normalized)
        const sanitizedEmails = Array.from(emailSet)
        const needsSync =
          emailSet.size !== initialSize ||
          originalEmails.length !== sanitizedEmails.length ||
          originalEmails.some((email) => normalizeEmail(email) !== email)
        if (needsSync) {
          updates.emails = sanitizedEmails
        }

        const primaryNormalized = normalizeEmail(existingContact.primaryEmail)
        if (primaryNormalized !== existingContact.primaryEmail) {
          updates.primaryEmail = primaryNormalized
        }

        await ctx.db.patch(existingContact._id, updates)
        return existingContact._id
      }

      return contactId
    }
  },
})

// Internal mutation for touching last contacted timestamp
export const touchLastContactedInternal = internalMutation({
  args: {
    email: v.string(),
    ts: v.number(),
  },
  handler: async (ctx, { email, ts }) => {
    const normalized = normalizeEmail(email)

    const contact = await findContactByAnyEmail(ctx, normalized)

    if (contact) {
      await ctx.db.patch(contact._id, {
        lastContactedAt: ts,
        updatedAt: Date.now(),
      })
    }
  },
})

export const updateEnrichment = mutation({
  args: {
    contactId: v.id("contacts"),
    enrichments: v.any(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("error"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const { contactId, enrichments, status, error } = updateEnrichmentSchema.parse(args)

    const contact = await ctx.db.get(contactId)
    if (!contact) {
      throw new Error("Contact not found")
    }

    const now = Date.now()

    await ctx.db.patch(contactId, {
      enrichment: {
        contactId,
        provider: 'fire-enrich',
        updatedAt: now,
        lastRunStatus: status,
        lastRunError: error,
        fields: enrichments,
      },
      updatedAt: now,
    })

    return contactId
  },
})

// Internal mutation to apply enrichment data to top-level contact fields if empty
export const applyEnrichmentToContact = internalMutation({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, { contactId }) => {
    const contact = await ctx.db.get(contactId)
    if (!contact || !contact.enrichment?.fields) {
      return contactId
    }

    const enrichments = contact.enrichment.fields as Record<string, {
      field: string
      value: string | number | boolean | string[] | null
      confidence: number
      source?: string
    }>

    const updates: {
      company?: string
      title?: string
      updatedAt: number
    } = {
      updatedAt: Date.now(),
    }

    // Apply company name if empty and enrichment has companyName
    if (!contact.company && enrichments.companyName) {
      const companyName = enrichments.companyName.value
      if (typeof companyName === 'string' && companyName.length > 0) {
        updates.company = companyName
      }
    }

    // Apply title if empty and enrichment has titleNormalized
    if (!contact.title && enrichments.titleNormalized) {
      const title = enrichments.titleNormalized.value
      if (typeof title === 'string' && title.length > 0) {
        updates.title = title
      }
    }

    // Only patch if we have updates
    if (updates.company || updates.title) {
      await ctx.db.patch(contactId, updates)
    }

    return contactId
  },
})

// Backfill action to seed contacts from existing emails
export const backfillFromEmails = action({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)

    // Get all emails (paginated)
    const emails = await ctx.runQuery(api.emails.list)
    const sentEmails = await ctx.runQuery(api.emails.listSent)

    const allEmails = [...(emails || []), ...(sentEmails || [])]
    const processed = new Set<string>()

    for (const email of allEmails) {
      // Process 'from' field
      if (email.from) {
        const fromNormalized = normalizeEmail(email.from)
        if (!processed.has(fromNormalized)) {
          const name = extractNameFromEmailString(email.from)
          await ctx.runMutation(internal.contacts.upsertContactFromEmail, {
            email: fromNormalized,
            name,
          })
          processed.add(fromNormalized)
        }
      }

      // Process 'to' field
      if (email.to) {
        const toEmails = extractEmailsFromString(email.to)
        for (const addr of toEmails) {
          if (!processed.has(addr)) {
            await ctx.runMutation(internal.contacts.upsertContactFromEmail, {
              email: addr,
            })
            processed.add(addr)
          }
        }
      }

      // Process 'cc' field
      if (email.cc) {
        const ccEmails = extractEmailsFromString(email.cc)
        for (const addr of ccEmails) {
          if (!processed.has(addr)) {
            await ctx.runMutation(internal.contacts.upsertContactFromEmail, {
              email: addr,
            })
            processed.add(addr)
          }
        }
      }
    }

    return { processed: processed.size }
  },
})

