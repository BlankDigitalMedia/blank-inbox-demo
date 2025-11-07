# Demo Mode Example

This folder contains demo mode functionality for Blank Inbox. Demo mode allows visitors to try the application without requiring real email provider API keys or webhook configuration.

## What's Included

- **`components/demo-banner.tsx`** - Demo banner UI component
- **`lib/demo.ts`** - Demo mode detection utilities
- **`README.md`** - This file (setup documentation)

## Integration

Demo mode is **optional** and can be enabled by:

1. Setting environment variables (see below)
2. The main app will automatically detect and use demo components

### Files Modified in Main App

The main app has minimal hooks for demo mode:

- **`convex/auth.ts`** - Small conditional to bypass single-user restriction
- **`convex/emails.ts`** - Small conditional to mock email sending
- **`app/layout.tsx`** - Conditionally imports demo banner
- **`components/composer/composer.tsx`** - Conditionally imports demo mode check

These are tiny, safe conditionals that have zero impact when demo mode is disabled.

## Setup

### 1. Set Environment Variables

#### Next.js Client-Side (`.env.local`)

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

#### Convex Server-Side

```bash
npx convex env set DEMO_MODE true
```

### 2. Verify Demo Mode

After setting environment variables:

1. Restart your Next.js dev server: `npm run dev`
2. Restart Convex dev: `npx convex dev` (if running)
3. Check that the demo banner appears at the top of the page

## Using Demo Mode

### Demo User Account

In demo mode, you can create multiple user accounts. Suggested demo credentials:
- Email: `demo@blankinbox.dev`
- Password: `demo123`

Or use any email/password combination you prefer.

### Seeding Demo Data

After signing in, you can seed demo data:

1. **Via UI**: Click the "Reset Demo Data" button in the demo banner
2. **Via Convex Dashboard**: Run the `seedDemo` action manually

The seed data includes:
- 15-20 sample emails (inbox, sent, drafts, threaded conversations)
- 8-10 sample contacts with enrichment data

### Resetting Demo Data

Click the "Reset Demo Data" button in the demo banner to:
1. Clear all existing emails and contacts
2. Reseed fresh demo data

## Demo Mode Features

### Email Sending

When demo mode is enabled:
- Emails are **not actually sent** via Resend or inbound.new
- Emails are stored locally with a fake `messageId` (format: `demo-{timestamp}-{random}`)
- A toast notification appears: "Demo mode: Email saved locally (not actually sent)"
- All email functionality works normally (compose, reply, forward, threading)

### Authentication

When demo mode is enabled:
- Multiple users can sign up (single-user restriction is bypassed)
- All other auth features work normally (password hashing, sessions, route protection)
- Admin email restriction (`ADMIN_EMAIL`) still applies unless disabled

### Data Isolation

Demo data is stored in the same database as production data. For complete isolation:
- **Recommended**: Use a separate Convex deployment for demo
- **Alternative**: Filter demo data by user email pattern (e.g., `*@demo.blankinbox.dev`)

## Disabling Demo Mode

To disable demo mode:

1. Remove or set to `false` in `.env.local`:
   ```bash
   NEXT_PUBLIC_DEMO_MODE=false
   ```

2. Remove or set to `false` in Convex:
   ```bash
   npx convex env set DEMO_MODE false
   ```

3. Restart your servers

**Important**: When demo mode is disabled, all normal restrictions apply (single-user, email provider required, etc.).

## Production Demo Deployment

For a public demo deployment:

1. **Separate Convex Deployment**: Create a dedicated Convex project for demo
2. **Set Environment Variables**: Configure `DEMO_MODE=true` in both Next.js and Convex
3. **Pre-seed Data**: Run `seedDemo` action after initial deployment
4. **Auto-reset**: Consider scheduling periodic resets (via cron or scheduled Convex functions)

### Example Vercel Deployment

```bash
# Set Next.js environment variable
vercel env add NEXT_PUBLIC_DEMO_MODE production
# Enter: true

# Set Convex environment variable (in Convex dashboard or CLI)
npx convex env set DEMO_MODE true
```

## Troubleshooting

### Demo banner doesn't appear

- Verify `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local`
- Restart Next.js dev server
- Check browser console for errors

### Demo data doesn't seed

- Verify `DEMO_MODE=true` in Convex environment variables
- Check Convex logs: `npx convex logs`
- Ensure you're authenticated (demo actions require auth)

### Email sending still calls APIs

- Verify `DEMO_MODE=true` is set in Convex (not just Next.js)
- Check Convex logs for demo mode detection
- Restart Convex dev server if running locally

### Multiple signups still blocked

- Verify `DEMO_MODE=true` in Convex environment variables
- Check Convex logs for auth callback execution
- Ensure environment variable is set correctly (exactly `"true"`, not `"1"` or `"yes"`)

## Security Notes

- Demo mode should **never** be enabled in production by default
- Demo mode bypasses single-user restriction (intentional for demo purposes)
- Demo mode does not bypass authentication (users still need passwords)
- All demo operations are logged for audit trail
- Rate limiting still applies in demo mode (prevents abuse)

## API Reference

### Public Actions (in `convex/demo/index.ts`)

- `api.demo.seedDemo()` - Seed demo emails and contacts
- `api.demo.resetDemo()` - Clear and reseed demo data

Both actions require:
- Authentication (`requireUserId`)
- Demo mode enabled (`DEMO_MODE === "true"`)

### Internal Mutations (in `convex/demo/seed.ts`)

- `internal.demo.seed.seedDemoEmails()` - Seed emails only
- `internal.demo.seed.seedDemoContacts()` - Seed contacts only
- `internal.demo.seed.clearDemoData()` - Clear all data
- `internal.demo.seed.addDemoEmail()` - Add single email

All internal mutations check `DEMO_MODE === "true"` before executing.

## Note for Forkers

If you're forking or copying this repository and don't need demo mode:

1. **You can safely ignore** the `examples/demo/` folder
2. **You can remove** the small conditionals in:
   - `convex/auth.ts` (lines ~35-41)
   - `convex/emails.ts` (lines ~931-989)
   - `app/layout.tsx` (conditional import)
   - `components/composer/composer.tsx` (conditional import)
3. **You can delete** the `convex/demo/` folder (Convex functions)

The demo code is completely optional and doesn't affect core functionality.
