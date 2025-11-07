"use client"

import { useState, FormEvent, useEffect } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Mail, ArrowRight } from "lucide-react"

// Demo user credentials
const DEMO_USER_EMAIL = "demo@blankinbox.dev"
const DEMO_USER_PASSWORD = "demo123"

export default function SignInPage() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // Check if demo mode is enabled
  const isDemoMode = isMounted && process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  // Check if signup is allowed (only if no users exist, or in demo mode)
  const userCount = useQuery(api.users.count) ?? 0
  const signupAllowed = userCount === 0 || isDemoMode

  useEffect(() => {
    setIsMounted(true)
    // In demo mode, automatically redirect to app (no auth needed)
    if (isMounted && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      router.replace("/")
    }
  }, [isMounted, router])

  const handleDemoSignIn = () => {
    // In demo mode, just redirect - no authentication needed
    router.replace("/")
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Client-side UX hint (server-side enforcement is primary)
    if (flow === "signUp" && !signupAllowed) {
      setError("Signup is disabled. This instance is limited to a single user.")
      setLoading(false)
      return
    }

    try {
      await signIn("password", { email, password, flow })
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.")
      setLoading(false)
    }
  }

  // Show demo mode UI
  if (isDemoMode) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to Blank Inbox
            </h1>
            <p className="text-sm text-muted-foreground">
              Demo mode is active. Click below to explore the app without creating an account.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleDemoSignIn}
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              "Opening..."
            ) : (
              <>
                Open App
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            This is a demo environment. Data resets periodically and emails are not actually sent.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {flow === "signIn" ? "Sign in to your account" : "Create an account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and password to {flow === "signIn" ? "sign in" : "get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Loading..." : flow === "signIn" ? "Sign In" : "Sign Up"}
          </Button>
        </form>

        {signupAllowed && (
          <>
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                OR
              </span>
            </div>
          </>
        )}

        {signupAllowed && (
          <div className="text-center text-sm">
            {flow === "signIn" ? (
              <span>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setFlow("signUp")}
                  className="text-primary hover:underline font-medium"
                >
                  Sign up
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setFlow("signIn")}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
