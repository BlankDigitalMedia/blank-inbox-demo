"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCompose } from "@/app/providers/compose-provider"
import { useAuthActions } from "@convex-dev/auth/react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { Inbox, Send, FileText, Archive, Trash2, Star, Search, PenSquare, LogOut, Users, Settings } from "lucide-react"
import { SoundSettingsDialog } from "@/components/settings/sound-settings-dialog"

interface MailSidebarProps {
  activeView?: "inbox" | "starred" | "sent" | "archive" | "trash" | "drafts" | "contacts"
  unreadCount?: number
}

export function MailSidebar({ activeView, unreadCount = 0 }: MailSidebarProps) {
  const { openNew } = useCompose()
  const { signOut } = useAuthActions()
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    router.push("/signin")
  }
  
  return (
    <Sidebar variant="inset" className="h-dvh">
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Mail</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open sound settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <Button onClick={() => openNew()} className="w-full justify-start gap-2" size="sm">
          <PenSquare className="h-4 w-4" />
          Compose
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <SidebarInput placeholder="Search mail..." className="pl-9" aria-label="Search mail" />
              </div>
            </div>
            <Separator />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "inbox"}>
                  <Link href="/">
                    <Inbox className="h-4 w-4" />
                    <span>Inbox</span>
                    {unreadCount > 0 && <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "starred"}>
                  <Link href="/starred">
                    <Star className="h-4 w-4" />
                    <span>Starred</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "sent"}>
                  <Link href="/sent">
                    <Send className="h-4 w-4" />
                    <span>Sent</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "drafts"}>
                  <Link href="/drafts">
                    <FileText className="h-4 w-4" />
                    <span>Drafts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "archive"}>
                  <Link href="/archive">
                    <Archive className="h-4 w-4" />
                    <span>Archive</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "trash"}>
                  <Link href="/trash">
                    <Trash2 className="h-4 w-4" />
                    <span>Trash</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeView === "contacts"}>
                  <Link href="/contacts">
                    <Users className="h-4 w-4" />
                    <span>Contacts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button onClick={handleSignOut} variant="ghost" className="w-full justify-start gap-2" size="sm">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </SidebarFooter>
      <SoundSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Sidebar>
  )
}
