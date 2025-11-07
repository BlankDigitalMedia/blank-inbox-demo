"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MailSidebar } from "@/components/mail-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import type { FunctionReference } from "convex/server"
import type { Email, EmailDoc, EmailListProps, EmailDetailProps } from "@/lib/types"
import { useIsLargeScreen } from "@/hooks/use-is-large-screen"
import { extractEmailAddress, normalizeEmail } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Conditionally import demo banner (only if demo mode is enabled)
let DemoBanner: (() => JSX.Element | null) | null = null;
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DemoBanner = require("@/examples/demo/components/demo-banner").DemoBanner;
}

interface EmailPageProps {
  title: string
  activeView: string
  query: FunctionReference<"query", "public">
  ListComponent: React.ComponentType<EmailListProps>
  DetailComponent: React.ComponentType<EmailDetailProps>
  shouldRemoveOnToggle?: (action: string, email: Email) => boolean
}

export function EmailPage({
  title,
  activeView,
  query,
  ListComponent,
  DetailComponent,
  shouldRemoveOnToggle
}: EmailPageProps) {

  const emails = useQuery(query)
  const unreadCount = useQuery(api.emails.unreadCount)
  const toggleStar = useMutation(api.emails.toggleStar)
  const toggleArchive = useMutation(api.emails.toggleArchive)
  const toggleTrash = useMutation(api.emails.toggleTrash)
  const markRead = useMutation(api.emails.markRead)
  const createMockEmail = useMutation(api.emails.createMockEmail)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const isLg = useIsLargeScreen()

  // Scroll management
  const listScrollRef = useRef<HTMLDivElement>(null)
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const savedListScrollTop = useRef<number>(0)

  // Extract unique email addresses from emails for contact lookup
  const emailAddresses = useMemo(() => {
    if (!emails) return []
    const addresses = new Set<string>()
    for (const email of emails) {
      if (email.from) {
        const addr = normalizeEmail(extractEmailAddress(email.from))
        if (addr) addresses.add(addr)
      }
    }
    return Array.from(addresses)
  }, [emails])

  // Fetch contacts for all email addresses
  const contactsMap = useQuery(
    api.contacts.getContactsByEmails,
    emailAddresses.length > 0 ? { emails: emailAddresses } : "skip"
  ) as Record<string, { id: Id<"contacts">; name?: string }> | undefined

  // Transform and thread emails
  const transformedEmails: Email[] = useMemo(() => {
    const emailGroups = (emails ?? []).reduce((groups: Record<string, EmailDoc[]>, email: EmailDoc) => {
      const threadId = email.threadId || email._id
      if (!groups[threadId]) {
        groups[threadId] = []
      }
      groups[threadId].push(email)
      return groups
    }, {} as Record<string, EmailDoc[]>)

    return Object.values(emailGroups).map((threadEmails) => {
      const typedThreadEmails = threadEmails as EmailDoc[]
      const sortedThread = typedThreadEmails.sort((a, b) => b.receivedAt - a.receivedAt)
      const latestEmail = sortedThread[0]!
      const threadCount = sortedThread.length

      // Look up contact for this email's from address
      const fromEmail = normalizeEmail(extractEmailAddress(latestEmail.from))
      const contact = contactsMap?.[fromEmail]

      return {
        id: latestEmail._id,
        from: latestEmail.from,
        subject: latestEmail.subject,
        preview: latestEmail.preview,
        time: new Date(latestEmail.receivedAt).toLocaleString(),
        read: latestEmail.read,
        starred: latestEmail.starred,
        archived: latestEmail.archived,
        trashed: latestEmail.trashed,
        category: latestEmail.category ?? "inbox",
        body: latestEmail.body,
        threadId: latestEmail.threadId,
        threadCount,
        threadEmails: sortedThread,
        contactId: contact?.id,
        contactName: contact?.name,
      } as Email
    })
  }, [emails, contactsMap])

  const activeSelectedEmail = useMemo(() => {
    if (!selectedEmail) return null
    const exists = transformedEmails.some((e) => e.id === selectedEmail.id)
    return exists ? selectedEmail : null
  }, [transformedEmails, selectedEmail])

  const handleToggleStar = async (id: string) => {
    await toggleStar({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      const shouldRemove = shouldRemoveOnToggle?.("star", activeSelectedEmail)
      if (shouldRemove) {
        setSelectedEmail(null)
      } else {
        setSelectedEmail({ ...activeSelectedEmail, starred: !activeSelectedEmail.starred })
      }
    }
  }

  const handleToggleArchive = async (id: string) => {
    await toggleArchive({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      const shouldRemove = shouldRemoveOnToggle?.("archive", activeSelectedEmail)
      if (shouldRemove) {
        setSelectedEmail(null)
      } else {
        setSelectedEmail({ ...activeSelectedEmail, archived: !(activeSelectedEmail.archived ?? false) })
      }
    }
  }

  const handleToggleTrash = async (id: string) => {
    await toggleTrash({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      const shouldRemove = shouldRemoveOnToggle?.("trash", activeSelectedEmail)
      if (shouldRemove) {
        setSelectedEmail(null)
      }
    }
  }

  const handleMarkRead = async (id: string) => {
    await markRead({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      setSelectedEmail({ ...activeSelectedEmail, read: true })
    }
  }

  // Mobile back navigation and history state
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isLg) return

    const onPopState = () => {
      // When user presses back, close the detail if open
      setSelectedEmail(null)
      // restore list scroll after returning
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = savedListScrollTop.current
        }
      })
    }

    // When detail opens on mobile, push a history state; when switching detail, replace it
    if (activeSelectedEmail) {
      if (!window.history.state?.emailSelected) {
        window.history.pushState({ emailSelected: true }, "")
      } else {
        window.history.replaceState({ emailSelected: true }, "")
      }
      window.addEventListener("popstate", onPopState)
      // Scroll detail to top
      requestAnimationFrame(() => {
        detailScrollRef.current?.scrollTo({ top: 0 })
      })
      return () => {
        window.removeEventListener("popstate", onPopState)
      }
    } else {
      // If no selection, ensure we don't leave a fake state hanging
      if (window.history.state?.emailSelected) {
        try {
          window.history.replaceState({}, "")
        } catch {}
      }
    }
  }, [activeSelectedEmail, isLg])

  const handleSelectEmail = (email: Email) => {
    // Save list scroll position before switching to detail on mobile
    if (!isLg && listScrollRef.current) {
      savedListScrollTop.current = listScrollRef.current.scrollTop
    }
    setSelectedEmail(email)
    handleMarkRead(email.id)
  }

  const handleBack = () => {
    if (isLg) {
      setSelectedEmail(null)
      return
    }
    if (typeof window !== "undefined" && window.history.state?.emailSelected) {
      window.history.back()
    } else {
      setSelectedEmail(null)
    }
  }

  const showList = isLg || (!isLg && !activeSelectedEmail)
  const showDetail = isLg || (!isLg && !!activeSelectedEmail)

  return (
    <SidebarProvider>
      <MailSidebar activeView={activeView as "inbox" | "starred" | "sent" | "archive" | "trash" | "drafts"} unreadCount={unreadCount} />
      <SidebarInset>
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <h1 className="text-lg font-semibold">{title}</h1>
            {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
              <div className="ml-auto">
                <Button
                  size="sm"
                  onClick={() => {
                    createMockEmail({})
                  }}
                >
                  Receive mock email
                </Button>
              </div>
            )}
          </header>
          {DemoBanner && <DemoBanner />}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* List pane */}
            <div className={showList ? "flex w-full lg:w-96" : "hidden lg:flex w-full lg:w-96"}>
              <ListComponent
                emails={transformedEmails}
                selectedEmail={activeSelectedEmail}
                onSelectEmail={handleSelectEmail}
                onToggleStar={handleToggleStar}
                onToggleArchive={handleToggleArchive}
                onToggleTrash={handleToggleTrash}
                scrollRef={listScrollRef}
              />
            </div>

            {/* Detail pane */}
            <div className={showDetail ? "flex flex-1 min-w-0" : "hidden lg:flex flex-1 min-w-0"}>
              <DetailComponent
                email={activeSelectedEmail}
                onToggleStar={handleToggleStar}
                onToggleArchive={handleToggleArchive}
                onToggleTrash={handleToggleTrash}
                onBack={handleBack}
                contentRef={detailScrollRef}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
