import type { Metadata } from 'next'
import { Bangers, Manrope } from 'next/font/google'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { ConvexClientProvider } from '@/lib/convex-provider'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { ComposeProvider } from '@/app/providers/compose-provider'
import { ComposeDockWrapper } from '@/components/compose-dock-wrapper'
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"
import { NewMailSound } from '@/components/new-mail-sound'
import { SentMailSound } from '@/components/sent-mail-sound'


const bangers = Bangers({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bangers',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
})

export const metadata: Metadata = {
  title: 'Blank Inbox',
  description: 'Created with blank-inbox',
  generator: 'blank-inbox',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bangers.variable} ${manrope.variable}`}>
      <body className={`font-sans antialiased h-dvh overflow-hidden`}>
        <ConvexAuthNextjsServerProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ConvexClientProvider>
              <ComposeProvider>
                {children}
                <ComposeDockWrapper />
                <Toaster />
                <NewMailSound />
                <SentMailSound />
              </ComposeProvider>
            </ConvexClientProvider>
          </ThemeProvider>
          <Analytics />
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  )
}
