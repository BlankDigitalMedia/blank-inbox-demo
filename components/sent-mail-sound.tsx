"use client"

import { useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { usePathname } from "next/navigation"
import { getSoundFile, DEFAULT_OUTGOING } from "@/lib/sounds"

function SentMailSoundInner() {
  const sentEmails = useQuery(api.emails.listSent)
  const settings = useQuery(api.users.getSettings)
  const prevCountRef = useRef<number | undefined>(undefined)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const outgoingSound = settings?.outgoingSound ?? DEFAULT_OUTGOING
  const soundFile = getSoundFile(outgoingSound)

  // Initialize audio and recreate when sound changes
  useEffect(() => {
    const audio = new Audio(soundFile)
    audio.preload = "auto"
    audioRef.current = audio
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
        audioRef.current = null
      }
    }
  }, [soundFile])

  // Play when sent email count increases (skip first load)
  useEffect(() => {
    if (!Array.isArray(sentEmails)) return
    const currentCount = sentEmails.length
    const prev = prevCountRef.current
    prevCountRef.current = currentCount
    if (prev === undefined) return
    if (currentCount > prev) {
      const a = audioRef.current
      if (a) {
        a.currentTime = 0
        a.play().catch(() => {})
      }
    }
  }, [sentEmails])

  return null
}

export function SentMailSound() {
  const pathname = usePathname()
  if (pathname === "/signin") return null
  return <SentMailSoundInner />
}

