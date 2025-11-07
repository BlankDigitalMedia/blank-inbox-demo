"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MailSidebar } from "@/components/mail-sidebar"
import { DraftList } from "@/components/draft-list"
import { DraftDetail } from "@/components/draft-detail"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import type { Email } from "@/lib/types"
import { useIsLargeScreen } from "@/hooks/use-is-large-screen"

// Conditionally import demo banner (only if demo mode is enabled)
let DemoBanner: (() => JSX.Element | null) | null = null;
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DemoBanner = require("@/examples/demo/components/demo-banner").DemoBanner;
}

export default function DraftsPage() {
  const emails = useQuery(api.emails.listDrafts)
  const toggleStar = useMutation(api.emails.toggleStar)
  const toggleArchive = useMutation(api.emails.toggleArchive)
  const markRead = useMutation(api.emails.markRead)
  const deleteDraft = useMutation(api.emails.deleteDraft)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const isLg = useIsLargeScreen()

  // Scroll management
  const listScrollRef = useRef<HTMLDivElement>(null)
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const savedListScrollTop = useRef<number>(0)

  const drafts = useMemo(() => {
    return (emails ?? []).map((e) => ({
      id: e._id,
      from: e.from,
      subject: e.subject,
      preview: e.preview,
      time: new Date(e.receivedAt).toLocaleString(),
      read: e.read,
      starred: e.starred,
      archived: e.archived,
      category: e.category ?? "inbox",
      body: e.body,
      threadId: e.threadId,
      threadCount: 1,
      threadEmails: [e],
    }))
  }, [emails])

  const activeSelectedEmail = useMemo(() => {
    if (!selectedEmail) return null
    const exists = drafts.some((draft) => draft.id === selectedEmail.id)
    return exists ? selectedEmail : null
  }, [drafts, selectedEmail])

  const handleToggleStar = async (id: string) => {
    await toggleStar({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      setSelectedEmail({ ...activeSelectedEmail, starred: !activeSelectedEmail.starred })
    }
  }

  const handleToggleArchive = async (id: string) => {
    await toggleArchive({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      setSelectedEmail({ ...activeSelectedEmail, archived: !(activeSelectedEmail.archived ?? false) })
    }
  }

  const handleDeleteDraft = async (id: string) => {
    await deleteDraft({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      setSelectedEmail(null)
    }
  }

  const handleMarkRead = async (id: string) => {
    await markRead({ id: id as Id<"emails"> })
    if (activeSelectedEmail?.id === id) {
      setSelectedEmail({ ...activeSelectedEmail, read: true })
    }
  }

  // Mobile history/back handling
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isLg) return

    const onPopState = () => {
      setSelectedEmail(null)
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = savedListScrollTop.current
        }
      })
    }

    if (activeSelectedEmail) {
      if (!window.history.state?.emailSelected) {
        window.history.pushState({ emailSelected: true }, "")
      } else {
        window.history.replaceState({ emailSelected: true }, "")
      }
      window.addEventListener("popstate", onPopState)
      requestAnimationFrame(() => {
        detailScrollRef.current?.scrollTo({ top: 0 })
      })
      return () => {
        window.removeEventListener("popstate", onPopState)
      }
    } else {
      if (window.history.state?.emailSelected) {
        try {
          window.history.replaceState({}, "")
        } catch {}
      }
    }
  }, [activeSelectedEmail, isLg])

  const handleSelectEmail = (email: Email) => {
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
      <MailSidebar activeView="drafts" />
      <SidebarInset>
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <h1 className="text-lg font-semibold">Drafts</h1>
          </header>
          {DemoBanner && <DemoBanner />}
          <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* List */}
          <div className={showList ? "flex w-full lg:w-96" : "hidden lg:flex w-full lg:w-96"}>
            <DraftList
              emails={drafts}
              selectedEmail={activeSelectedEmail}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
              onToggleArchive={handleToggleArchive}
              onDeleteDraft={handleDeleteDraft}
              scrollRef={listScrollRef}
            />
          </div>

          {/* Detail */}
          <div className={showDetail ? "flex flex-1 min-w-0" : "hidden lg:flex flex-1 min-w-0"}>
            <DraftDetail
              email={activeSelectedEmail}
              onToggleStar={handleToggleStar}
              onToggleArchive={handleToggleArchive}
              onDeleteDraft={handleDeleteDraft}
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
