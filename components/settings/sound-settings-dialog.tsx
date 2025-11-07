"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SOUND_OPTIONS, DEFAULT_INCOMING, DEFAULT_OUTGOING, getSoundFile } from "@/lib/sounds"

interface SoundSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SoundSettingsDialog({ open, onOpenChange }: SoundSettingsDialogProps) {
  const settings = useQuery(api.users.getSettings)
  const updateSettings = useMutation(api.users.updateSettings)
  
  const [incomingSound, setIncomingSound] = useState<string>(DEFAULT_INCOMING)
  const [outgoingSound, setOutgoingSound] = useState<string>(DEFAULT_OUTGOING)

  // Initialize local state when settings load
  useEffect(() => {
    if (settings) {
      setIncomingSound(settings.incomingSound)
      setOutgoingSound(settings.outgoingSound)
    }
  }, [settings])

  const handleTestIncoming = () => {
    const audio = new Audio(getSoundFile(incomingSound))
    audio.play().catch(() => {
      toast.error("Failed to play sound")
    })
  }

  const handleTestOutgoing = () => {
    const audio = new Audio(getSoundFile(outgoingSound))
    audio.play().catch(() => {
      toast.error("Failed to play sound")
    })
  }

  const handleSave = async () => {
    try {
      await updateSettings({
        incomingSound,
        outgoingSound,
      })
      toast.success("Sound settings saved")
      onOpenChange(false)
    } catch (error) {
      toast.error("Failed to save settings")
      console.error(error)
    }
  }

  // Reset to saved values when dialog closes
  useEffect(() => {
    if (!open && settings) {
      setIncomingSound(settings.incomingSound)
      setOutgoingSound(settings.outgoingSound)
    }
  }, [open, settings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sound Settings</DialogTitle>
          <DialogDescription>
            Choose notification sounds for incoming and outgoing emails.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="incoming-sound">Incoming Email Sound</Label>
            <div className="flex gap-2">
              <Select value={incomingSound} onValueChange={setIncomingSound}>
                <SelectTrigger id="incoming-sound" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_OPTIONS.map((sound) => (
                    <SelectItem key={sound.id} value={sound.id}>
                      {sound.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={handleTestIncoming}
                aria-label="Test incoming email sound"
              >
                Test
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="outgoing-sound">Outgoing Email Sound</Label>
            <div className="flex gap-2">
              <Select value={outgoingSound} onValueChange={setOutgoingSound}>
                <SelectTrigger id="outgoing-sound" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_OPTIONS.map((sound) => (
                    <SelectItem key={sound.id} value={sound.id}>
                      {sound.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={handleTestOutgoing}
                aria-label="Test outgoing email sound"
              >
                Test
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

