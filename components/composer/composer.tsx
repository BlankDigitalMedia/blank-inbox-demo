"use client"

import {
  Fragment,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useAction, useMutation, useQuery, usePaginatedQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Send, X } from "lucide-react"
import { toast } from "sonner"
import { cn, sanitizeHtml } from "@/lib/utils"
import { useCompose } from "@/app/providers/compose-provider"
import type { Email } from "@/lib/types"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FROM_ADDRESSES, useSenderSelection } from "@/hooks/use-sender-selection"
import { useDraftAutosave } from "@/hooks/use-draft-autosave"

// Conditionally import demo mode utility (only if demo mode is enabled)
// Using require to avoid bundling demo code when not needed
let isDemoMode: () => boolean = () => false;
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  isDemoMode = require("@/examples/demo/lib/demo").isDemoMode;
}

const ADDRESS_DELIMITER_REGEX = /[,;\n]+/

const parseRecipientValue = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const angleMatch = trimmed.match(/<([^>]+)>/)
  const raw = angleMatch?.[1] ?? trimmed
  const sanitized = raw.replace(/^[\s,;"']+|[\s,;"']+$/g, "")
  if (!sanitized) return null
  return sanitized
}

const parseRecipientList = (value?: string) => {
  if (!value) return []
  return value
    .split(ADDRESS_DELIMITER_REGEX)
    .map(parseRecipientValue)
    .filter((addr): addr is string => Boolean(addr))
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

type RecipientMutationResult = {
  added: string[]
  invalid: string[]
}

type ContactSuggestion = {
  address: string
  name?: string
  lastSeen: number
  count: number
}

interface ComposerProps {
  mode: "inline" | "modal"
  intent: "new" | "reply" | "replyAll" | "forward"
  email?: Email
  threadId?: string
  draftId?: string
  windowId?: string
  initialFrom?: string
  initialTo?: string
  initialCc?: string
  initialBcc?: string
  initialSubject?: string
  initialBody?: string
  onSend: () => void
  onCancel: () => void
}

export function Composer({
  mode,
  intent,
  email,
  threadId,
  draftId: initialDraftId,
  windowId,
  initialFrom,
  initialTo,
  initialCc,
  initialBcc,
  initialSubject,
  initialBody,
  onSend,
  onCancel,
}: ComposerProps) {
  const [from, setFrom] = useState(initialFrom || email?.from || "")
  const [toRecipients, setToRecipients] = useState<string[]>(() => parseRecipientList(initialTo || email?.to))
  const [toInput, setToInput] = useState("")
  const [cc, setCc] = useState(initialCc || email?.cc || "")
  const [bcc, setBcc] = useState(initialBcc || email?.bcc || "")
  const [subject, setSubject] = useState(initialSubject || email?.subject || "")
  const [isSending, setIsSending] = useState(false)
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(initialDraftId)
  const [isToFocused, setIsToFocused] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [suppressSuggestions, setSuppressSuggestions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toFieldRef = useRef<HTMLDivElement>(null)
  const toInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const recentTimerRef = useRef<number | null>(null)

  const { update } = useCompose()
  const sendEmail = useAction(api.emails.sendEmail)
  const toValue = useMemo(() => toRecipients.join(", "), [toRecipients])
  const { results: contactsData } = usePaginatedQuery(
    api.contacts.listContacts,
    {},
    { initialNumItems: 100 }
  )
  
  // Transform contacts to match expected format
  const contacts = useMemo(() => {
    if (!contactsData) return undefined
    return contactsData.map((contact) => ({
      address: contact.primaryEmail,
      name: contact.name,
      lastSeen: contact.lastContactedAt || contact.updatedAt,
      count: 0, // Not computed in MVP
    }))
  }, [contactsData])
  
  const { selectedFrom } = useSenderSelection({ email, intent })

  const selectedRecipients = useMemo(() => {
    return new Set(toRecipients.map((recipient) => recipient.toLowerCase()))
  }, [toRecipients])

  const toInputQuery = useMemo(() => toInput.trim().toLowerCase(), [toInput])
  const queryReady = toInputQuery.length > 0

  const filteredContacts = useMemo(() => {
    if (!contacts || !queryReady) return [] as Array<ContactSuggestion & { rank: number }>

    const ranked: Array<ContactSuggestion & { rank: number }> = []

    for (const contact of contacts) {
      if (!contact?.address) continue
      if (selectedRecipients.has(contact.address.toLowerCase())) continue

      const email = contact.address.toLowerCase()
      const name = contact.name?.toLowerCase() ?? ""

      if (email.startsWith(toInputQuery)) {
        ranked.push({ ...contact, rank: 0 })
        continue
      }

      if (name && name.startsWith(toInputQuery)) {
        ranked.push({ ...contact, rank: 1 })
        continue
      }

      const emailIndex = email.indexOf(toInputQuery)
      if (emailIndex !== -1) {
        ranked.push({ ...contact, rank: 2 + emailIndex })
        continue
      }

      if (name) {
        const nameIndex = name.indexOf(toInputQuery)
        if (nameIndex !== -1) {
          ranked.push({ ...contact, rank: 3 + nameIndex })
        }
      }
    }

    return ranked
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        if (b.count !== a.count) return b.count - a.count
        if (b.lastSeen !== a.lastSeen) return b.lastSeen - a.lastSeen
        return a.address.localeCompare(b.address)
      })
      .slice(0, 5)
  }, [contacts, queryReady, selectedRecipients, toInputQuery])

  const recentContacts = useMemo(() => {
    if (!contacts) return [] as ContactSuggestion[]

    const filtered = contacts.filter((contact: ContactSuggestion) => {
      if (!contact?.address) return false
      return !selectedRecipients.has(contact.address.toLowerCase())
    })

    return filtered.slice(0, 5)
  }, [contacts, selectedRecipients])

  const showEmptyState = queryReady && filteredContacts.length === 0

  const shouldShowDropdown = Boolean(
    isToFocused &&
      !suppressSuggestions &&
      contacts &&
      ((queryReady && (filteredContacts.length > 0 || showEmptyState)) || (showRecent && recentContacts.length > 0))
  )

  const highlightMatch = useCallback(
    (value: string, query: string): ReactNode => {
      if (!query) return value
      const index = value.toLowerCase().indexOf(query)
      if (index === -1) return value
      const end = index + query.length
      return (
        <Fragment>
          {value.slice(0, index)}
          <span className="font-semibold text-foreground">{value.slice(index, end)}</span>
          {value.slice(end)}
        </Fragment>
      )
    },
    []
  )

  const getContactInitials = useCallback((contact: ContactSuggestion) => {
    if (contact.name) {
      const parts = contact.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
      const initials = parts.map((part) => part[0] ?? "").join("")
      if (initials) return initials.toUpperCase()
    }
    const firstChar = contact.address?.[0]
    return firstChar ? firstChar.toUpperCase() : "?"
  }, [])

  const clearRecentTimer = useCallback(() => {
    if (recentTimerRef.current !== null) {
      window.clearTimeout(recentTimerRef.current)
      recentTimerRef.current = null
    }
  }, [])

  const scheduleRecentSuggestions = useCallback(() => {
    clearRecentTimer()
    recentTimerRef.current = window.setTimeout(() => {
      setShowRecent(true)
    }, 200)
  }, [clearRecentTimer])

  // Build initial editor content with quoted HTML for replies/forwards
  const getInitialContent = useCallback(() => {
    // If we have initialBody (from props), use it
    if (initialBody) {
      return initialBody
    }

    // If we have a draftId and email body (loading existing draft), use the saved body
    if (initialDraftId && email?.body) {
      return email.body
    }

    // For replies/forwards, build quoted content
    if ((intent === 'reply' || intent === 'replyAll' || intent === 'forward') && email?.body) {
      const sanitized = sanitizeHtml(email.body)
      
      const attribution = intent === 'forward' 
        ? `<div><strong>---------- Forwarded message ---------</strong><br><strong>From:</strong> ${email.from}<br>${email.to ? `<strong>To:</strong> ${email.to}<br>` : ''}<strong>Subject:</strong> ${email.subject || ''}<br><strong>Date:</strong> ${email.time || ''}</div>`
        : `<div>On ${email.time || ''}, ${email.from} wrote:</div>`
      
      return `<p><br></p>${attribution}<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${sanitized}</blockquote>`
    }
    
    return '<p><br></p>'
  }, [intent, email, initialBody, initialDraftId])

  const editor = useEditor({
    extensions: [StarterKit],
    content: getInitialContent(),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-sm max-w-none focus:outline-none h-full min-h-[200px] p-3 border rounded-md bg-background break-words font-serif',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Email message body',
      },
    },
    onCreate: ({ editor }) => {
      editor.commands.focus('start')
    },
  })

  const { autosaveStatus, flush: flushDraft, handleBlur } = useDraftAutosave({
    editor,
    from,
    to: toValue,
    cc,
    bcc,
    subject,
    threadId,
    currentDraftId,
    onDraftIdChange: (draftId) => {
      setCurrentDraftId(draftId)
      if (windowId) update(windowId, { draftId })
    },
  })

  useEffect(() => {
    const normalized = selectedFrom ?? ""

    if (intent === "new") {
      if (!from && normalized) {
        setFrom(normalized)
      }
      return
    }

    if (normalized && from !== normalized) {
      setFrom(normalized)
    }
  }, [from, intent, selectedFrom])

  useEffect(() => {
    if (typeof initialTo === "string") {
      setToRecipients(parseRecipientList(initialTo))
      setToInput("")
    }
  }, [initialTo])

  useEffect(() => {
    if (!email) return

    if (intent === 'reply') {
      setToRecipients(email?.from ? parseRecipientList(email.from) : [])
      setToInput("")
      setSubject(email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject || ""}`)
    } else if (intent === 'replyAll') {
      const recipients = new Set<string>()
      
      const fromAddress = email.from ? parseRecipientValue(email.from) : null
      if (fromAddress && fromAddress !== selectedFrom) {
        recipients.add(fromAddress)
      }
      
      if (email.to) {
        email.to.split(',').forEach((addr: string) => {
          const parsed = parseRecipientValue(addr)
          if (parsed && parsed !== selectedFrom) {
            recipients.add(parsed)
          }
        })
      }
      
      if (email.cc) {
        email.cc.split(',').forEach((addr: string) => {
          const parsed = parseRecipientValue(addr)
          if (parsed && parsed !== selectedFrom) {
            recipients.add(parsed)
          }
        })
      }
      
      setToRecipients(Array.from(recipients))
      setToInput("")
      setSubject(email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject || ""}`)
    } else if (intent === 'forward') {
      setToRecipients([])
      setToInput("")
      setSubject(email.subject?.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject || ""}`)
    }
  }, [email, intent, selectedFrom])

  useEffect(() => {
    if (mode === 'inline' && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [mode])

  useEffect(() => {
    return () => {
      clearRecentTimer()
    }
  }, [clearRecentTimer])



  const addRecipients = useCallback((candidates: string[]): RecipientMutationResult => {
    const result: RecipientMutationResult = { added: [], invalid: [] }
    if (!candidates.length) return result

    const cleaned = candidates
      .map((candidate) => parseRecipientValue(candidate ?? ""))
      .filter((addr): addr is string => Boolean(addr))

    if (!cleaned.length) {
      return result
    }

    const valid: string[] = []

    cleaned.forEach((addr) => {
      if (!isValidEmail(addr)) {
        result.invalid.push(addr)
      } else {
        valid.push(addr)
      }
    })

    if (valid.length) {
      setToRecipients((prev) => {
        const existing = new Set(prev.map((entry) => entry.toLowerCase()))
        const next = [...prev]
        valid.forEach((addr) => {
          const key = addr.toLowerCase()
          if (!existing.has(key)) {
            existing.add(key)
            next.push(addr)
            result.added.push(addr)
          }
        })
        return next
      })
    }

    if (result.invalid.length) {
      toast.error(`Invalid email${result.invalid.length > 1 ? "s" : ""}: ${result.invalid.join(", ")}`)
    }

    return result
  }, [])

  const commitTypedRecipient = useCallback(
    (value?: string): RecipientMutationResult => {
      const content = (value ?? toInput).trim()
      if (!content) {
        return { added: [], invalid: [] }
      }

      const parsed = parseRecipientList(content)
      if (!parsed.length) {
        setToInput("")
        return { added: [], invalid: [] }
      }

      const result = addRecipients(parsed)
      if (result.invalid.length) {
        setToInput(result.invalid[result.invalid.length - 1] ?? "")
      } else {
        setToInput("")
        setShowRecent(false)
        clearRecentTimer()
        scheduleRecentSuggestions()
        setSuppressSuggestions(false)
      }

      return result
    },
    [addRecipients, clearRecentTimer, scheduleRecentSuggestions, toInput]
  )

  const focusToInput = useCallback(() => {
    toInputRef.current?.focus()
  }, [])

  const handleToChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setToInput(value)
      setSuppressSuggestions(false)
      setShowRecent(false)
      clearRecentTimer()
      if (!value.trim()) {
        scheduleRecentSuggestions()
      }
    },
    [clearRecentTimer, scheduleRecentSuggestions]
  )

  const handleContactSelect = useCallback(
    (contact: ContactSuggestion) => {
      const result = addRecipients([contact.address])
      if (!result.invalid.length) {
        setToInput("")
        scheduleRecentSuggestions()
      }
      setShowRecent(false)
      setSuppressSuggestions(false)
      clearRecentTimer()
      focusToInput()
    },
    [addRecipients, clearRecentTimer, focusToInput, scheduleRecentSuggestions]
  )

  const handleToKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const trimmed = toInput.trim()

      if (event.key === "," || event.key === ";" || event.key === " " || event.key === "Spacebar" || event.key === "Space") {
        event.preventDefault()
        commitTypedRecipient()
        return
      }

      if (event.key === "Escape") {
        if (shouldShowDropdown) {
          event.preventDefault()
          setSuppressSuggestions(true)
          setShowRecent(false)
          clearRecentTimer()
        }
        return
      }

      const defaultSuggestion =
        (queryReady && filteredContacts[0]) ||
        (!queryReady && showRecent && recentContacts[0]) ||
        null

      if (event.key === "Enter") {
        if (defaultSuggestion) {
          event.preventDefault()
          handleContactSelect(defaultSuggestion)
          return
        }
        if (trimmed) {
          event.preventDefault()
          commitTypedRecipient()
        }
        return
      }

      if (event.key === "Tab") {
        if (defaultSuggestion) {
          event.preventDefault()
          handleContactSelect(defaultSuggestion)
          return
        }
        if (trimmed) {
          event.preventDefault()
          commitTypedRecipient()
        }
        return
      }

      if (event.key === "ArrowDown") {
        if (!shouldShowDropdown && !queryReady && recentContacts.length) {
          setShowRecent(true)
        }
        if (
          (queryReady && filteredContacts.length) ||
          (!queryReady && showRecent && recentContacts.length)
        ) {
          event.preventDefault()
          suggestionsRef.current?.focus()
        }
        return
      }

      if (event.key === "Backspace" && !toInput) {
        if (!toRecipients.length) return
        event.preventDefault()
        const last = toRecipients[toRecipients.length - 1]
        setToRecipients(toRecipients.slice(0, -1))
        setToInput(last ?? "")
      }
    },
    [
      clearRecentTimer,
      commitTypedRecipient,
      filteredContacts,
      handleContactSelect,
      queryReady,
      recentContacts,
      shouldShowDropdown,
      showRecent,
      toInput,
      toRecipients,
    ]
  )

  const handleRecipientAreaBlur = useCallback(
    (nextTarget: EventTarget | null) => {
      if (toFieldRef.current?.contains(nextTarget as Node)) {
        return
      }

      clearRecentTimer()
      setShowRecent(false)
      setSuppressSuggestions(false)
      setIsToFocused(false)
      commitTypedRecipient()
      handleBlur()
    },
    [clearRecentTimer, commitTypedRecipient, handleBlur]
  )

  const handleToBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      handleRecipientAreaBlur(event.relatedTarget)
    },
    [handleRecipientAreaBlur]
  )

  const handleToFocus = useCallback(() => {
    setIsToFocused(true)
    setSuppressSuggestions(false)
    setShowRecent(false)
    clearRecentTimer()
    if (!toInput.trim()) {
      scheduleRecentSuggestions()
    }
  }, [clearRecentTimer, scheduleRecentSuggestions, toInput])

  const handleToPaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData("text")
      if (!text) return

      const parsed = parseRecipientList(text)
      if (parsed.length <= 1) return

      event.preventDefault()
      setSuppressSuggestions(false)
      setShowRecent(false)
      clearRecentTimer()
      if (toInput.trim()) {
        commitTypedRecipient()
      }

      const result = addRecipients(parsed)
      if (result.invalid.length) {
        setToInput(result.invalid[result.invalid.length - 1] ?? "")
      } else {
        setToInput("")
        scheduleRecentSuggestions()
      }
    },
    [addRecipients, clearRecentTimer, commitTypedRecipient, scheduleRecentSuggestions, toInput]
  )

  const handleRemoveRecipient = useCallback(
    (index: number) => {
      setToRecipients((prev) => {
        if (index < 0 || index >= prev.length) return prev
        const next = [...prev]
        next.splice(index, 1)
        return next
      })
      focusToInput()
    },
    [focusToInput]
  )

  // Update window title from subject
  const prevTitleRef = useRef<string>("")
  
  useEffect(() => {
    if (!windowId) return
    
    const maxLen = 30
    const trimmed = subject?.trim() || ""
    let newTitle = ""
    
    if (trimmed) {
      newTitle = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "..." : trimmed
    } else {
      if (intent === "forward") newTitle = "Forward"
      else if (intent === "replyAll") newTitle = "Reply all"
      else if (intent === "reply") newTitle = "Reply"
      else newTitle = "New message"
    }
    
    if (newTitle !== prevTitleRef.current) {
      prevTitleRef.current = newTitle
      update(windowId, { title: newTitle })
    }
  }, [windowId, intent, subject, update])

  const handleSend = async () => {
    if (!editor || !from || !subject) return

    let recipients = toRecipients

    if (toInput.trim()) {
      const parsed = parseRecipientList(toInput.trim())
      const result = addRecipients(parsed)
      if (result.invalid.length) {
        setToInput(result.invalid[result.invalid.length - 1] ?? "")
        return
      }
      if (result.added.length) {
        recipients = [...recipients, ...result.added]
      }
      setToInput("")
    }

    if (!recipients.length) return

    const recipientString = recipients.join(", ")

    setIsSending(true)
    try {
      const fullHtml = editor.getHTML()
      
      // Convert HTML to plain text for text/plain part
      const htmlToText = (html: string) => {
        return html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .trim()
      }
      
      const sendParams: {
        from: string
        to: string
        cc?: string
        bcc?: string
        subject: string
        html: string
        text: string
        originalEmailId?: Id<"emails">
        draftId?: Id<"emails">
      } = {
        from,
        to: recipientString,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        html: fullHtml,
        text: htmlToText(fullHtml),
      }

      if (intent === 'reply' || intent === 'replyAll') {
        // email.id is the Convex _id string, cast it properly
        sendParams.originalEmailId = email?.id as Id<"emails">
      }

      if (currentDraftId) {
        sendParams.draftId = currentDraftId as Id<"emails">
      }

      await sendEmail(sendParams)
      
      // Show demo mode notification if enabled
      if (isDemoMode()) {
        toast.info("Demo mode: Email saved locally (not actually sent)")
      } else {
        toast.success("Email sent successfully")
      }
      
      onSend()
    } catch (error) {
      console.error("Failed to send email:", error)
      toast.error("Failed to send email")
    } finally {
      setIsSending(false)
    }
  }

  const isInline = mode === 'inline'
  const isReply = intent === 'reply' || intent === 'replyAll' || intent === 'forward'

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full flex-col",
        isInline && isReply && "mt-6 p-4 border border-border rounded-lg bg-muted/50 animate-in slide-in-from-bottom-2 duration-300"
      )}
    >
      <div className="shrink-0 space-y-3 px-4 py-3">
      {intent === 'new' && (
        <div className="space-y-2">
          <Label htmlFor="from">From</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger>
              <SelectValue placeholder="Select sender email" />
            </SelectTrigger>
            <SelectContent>
              {FROM_ADDRESSES.map((address) => (
                <SelectItem key={address.value} value={address.value}>
                  {address.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="to">To</Label>
          {intent === 'new' && (
            <div className="flex gap-2 text-xs">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Bcc
                </button>
              )}
            </div>
          )}
        </div>
        <div ref={toFieldRef} className="relative">
          <div
            className={cn(
              "flex min-h-10 w-full cursor-text flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-within:border-primary focus-within:ring-1 focus-within:ring-ring"
            )}
            onClick={focusToInput}
          >
            {toRecipients.map((recipient, index) => (
              <Badge
                key={`${recipient}-${index}`}
                variant="secondary"
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs"
              >
                <span>{recipient}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRemoveRecipient(index)
                  }}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-secondary-foreground/10"
                  aria-label={`Remove ${recipient}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <input
              ref={toInputRef}
              id="to"
              value={toInput}
              onChange={handleToChange}
              onKeyDown={handleToKeyDown}
              onBlur={handleToBlur}
              onFocus={handleToFocus}
              onPaste={handleToPaste}
              className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={toRecipients.length ? "" : "recipient@example.com"}
              autoComplete="off"
            />
          </div>
          {shouldShowDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-input bg-popover text-popover-foreground shadow-lg">
              <Command
                ref={suggestionsRef}
                shouldFilter={false}
                loop
                tabIndex={-1}
                onBlur={(event) => handleRecipientAreaBlur(event.relatedTarget)}
              >
                <CommandList>
                  {queryReady && filteredContacts.length > 0 && (
                    <CommandGroup heading="Suggestions">
                      {filteredContacts.map((contact) => (
                        <CommandItem
                          key={contact.address}
                          value={contact.address}
                          onMouseDown={(event) => event.preventDefault()}
                          onSelect={() => handleContactSelect(contact)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[0.7rem]">
                                {getContactInitials(contact)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {contact.name
                                  ? highlightMatch(contact.name, toInputQuery)
                                  : highlightMatch(contact.address, toInputQuery)}
                              </span>
                              {contact.name && (
                                <span className="text-xs text-muted-foreground">
                                  {highlightMatch(contact.address, toInputQuery)}
                                </span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {!queryReady && showRecent && recentContacts.length > 0 && (
                    <CommandGroup heading="Recent contacts">
                      {recentContacts.map((contact: ContactSuggestion) => (
                        <CommandItem
                          key={`recent-${contact.address}`}
                          value={contact.address}
                          onMouseDown={(event) => event.preventDefault()}
                          onSelect={() => handleContactSelect(contact)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[0.7rem]">
                                {getContactInitials(contact)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {contact.name ?? contact.address}
                              </span>
                              {contact.name && (
                                <span className="text-xs text-muted-foreground">{contact.address}</span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {showEmptyState && <CommandEmpty>No matches</CommandEmpty>}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>

      {(showCc || cc) && intent === 'new' && (
        <div className="space-y-2">
          <Label htmlFor="cc">CC</Label>
          <Input
            id="cc"
            type="email"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            onBlur={handleBlur}
            placeholder="cc@example.com"
          />
        </div>
      )}

      {(showBcc || bcc) && intent === 'new' && (
        <div className="space-y-2">
          <Label htmlFor="bcc">BCC</Label>
          <Input
            id="bcc"
            type="email"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            onBlur={handleBlur}
            placeholder="bcc@example.com"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={handleBlur}
          placeholder="Email subject"
          className="font-serif"
        />
      </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-3">
        <div className="h-full overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end border-t bg-background px-4 py-2">
        <div className="mr-auto text-xs text-muted-foreground">
          {autosaveStatus === "saving" && "Saving..."}
          {autosaveStatus === "saved" && "Saved"}
          {autosaveStatus === "error" && "Save failed. Retrying on next change..."}
        </div>
        <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
            onClick={async () => {
              try {
                await flushDraft()
              } catch {}
              onCancel()
            }}
            disabled={isSending}
        >
          <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        <Button
          size="sm"
          onClick={handleSend}
            disabled={!from || (!toRecipients.length && !toInput.trim()) || !subject || !editor || isSending}
        >
          <Send className="h-4 w-4 mr-2" />
            {isSending ? "Sending..." : "Send"}
          </Button>
        </ButtonGroup>
      </div>
    </div>
  )
}
