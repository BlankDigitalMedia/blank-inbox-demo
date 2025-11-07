"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useQuery, usePaginatedQuery } from "convex/react"
import { useSearchParams } from "next/navigation"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { MailSidebar } from "@/components/mail-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ContactList } from "@/components/contacts/contact-list"
import { ContactDetail } from "@/components/contacts/contact-detail"
import { NewContactDialog } from "@/components/contacts/new-contact-dialog"
import { useIsLargeScreen } from "@/hooks/use-is-large-screen"
import { Plus } from "lucide-react"

// Conditionally import demo banner (only if demo mode is enabled)
let DemoBanner: (() => JSX.Element | null) | null = null;
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DemoBanner = require("@/examples/demo/components/demo-banner").DemoBanner;
}

export default function ContactsPage() {
  const searchParams = useSearchParams()
  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | null>(null)
  const [search, setSearch] = useState("")
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false)

  const isLg = useIsLargeScreen()

  // Paginated contacts query with optional search term
  const {
    results: paginatedContacts,
    status: contactsStatus,
    loadMore: loadMoreContacts,
  } = usePaginatedQuery(
    api.contacts.listContacts,
    { search: search.trim() || undefined },
    { initialNumItems: 50 }
  )

  const contacts = paginatedContacts ?? []

  // Fetch specific contact if provided via query parameter (for inbox navigation)
  const contactParam = searchParams.get("contact")
  const contactIdFromParam = contactParam ? (contactParam as Id<"contacts">) : null
  const specificContact = useQuery(
    api.contacts.getContact,
    contactIdFromParam ? { id: contactIdFromParam } : "skip"
  )

  // Handle contact query parameter from inbox navigation
  useEffect(() => {
    if (contactIdFromParam) {
      setSelectedContactId(contactIdFromParam)
      // Clean up URL parameter
      const url = new URL(window.location.href)
      url.searchParams.delete("contact")
      window.history.replaceState({}, "", url.toString())
    }
  }, [contactIdFromParam])

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null
    
    // First check if it's in the filtered contacts list
    if (contacts.length > 0) {
      const found = contacts.find((c) => c._id === selectedContactId)
      if (found) return found
    }
    
    // If not in list (e.g., search filter active), use the specifically fetched contact
    if (contactIdFromParam === selectedContactId && specificContact) {
      return specificContact
    }
    
    return null
  }, [selectedContactId, contacts, contactIdFromParam, specificContact])

  const showList = isLg || (!isLg && !selectedContact)
  const showDetail = isLg || (!isLg && !!selectedContact)

  const hasMoreContacts = contactsStatus === "CanLoadMore"
  const isLoadingMoreContacts = contactsStatus === "LoadingMore"
  const isInitialContactsLoading = contactsStatus === "LoadingFirstPage"

  const handleLoadMoreContacts = useCallback(() => {
    if (hasMoreContacts) {
      loadMoreContacts(50)
    }
  }, [hasMoreContacts, loadMoreContacts])

  useEffect(() => {
    if (search.trim() && contacts.length === 0 && hasMoreContacts) {
      loadMoreContacts(50)
    }
  }, [search, contacts.length, hasMoreContacts, loadMoreContacts])

  const handleBack = () => {
    setSelectedContactId(null)
  }

  const handleContactCreated = (contactId: Id<"contacts">) => {
    setSelectedContactId(contactId)
  }

  const handleContactDeleted = () => {
    setSelectedContactId(null)
  }

  return (
    <SidebarProvider>
      <MailSidebar activeView="contacts" />
      <SidebarInset>
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <h1 className="text-lg font-semibold">Contacts</h1>
            <div className="ml-auto">
              <Button onClick={() => setNewContactDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Contact
              </Button>
            </div>
          </header>
          {DemoBanner && <DemoBanner />}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* List pane */}
            <div className={showList ? "flex w-full lg:w-96 flex-col" : "hidden lg:flex w-full lg:w-96 flex-col"}>
              <div className="p-4 border-b">
                <Input
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                  aria-label="Search contacts"
                />
              </div>
              <ContactList
                contacts={contacts}
                selectedContactId={selectedContactId}
                onSelectContact={setSelectedContactId}
                onLoadMore={handleLoadMoreContacts}
                hasNextPage={hasMoreContacts}
                isLoadingMore={isLoadingMoreContacts}
                isInitialLoading={isInitialContactsLoading}
              />
            </div>

            {/* Detail pane */}
            <div className={showDetail ? "flex flex-1 min-w-0" : "hidden lg:flex flex-1 min-w-0"}>
              <ContactDetail
                key={selectedContact?._id ?? "no-contact"}
                contact={selectedContact}
                onBack={handleBack}
                onDeleted={handleContactDeleted}
              />
            </div>
          </div>
        </div>
        <NewContactDialog
          open={newContactDialogOpen}
          onOpenChange={setNewContactDialogOpen}
          onCreated={handleContactCreated}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}

