# Demo Mode Setup Guide

This guide explains how to enable and use demo mode in Blank Inbox, allowing visitors to try the application without requiring real email provider API keys or webhook configuration.

## Overview

Demo mode enables a fully functional demo environment where:
- Email sending is mocked (emails are stored locally but not actually sent)
- Multiple users can sign up (bypasses single-user restriction)
- Pre-seeded sample data is available
- Demo data can be reset easily

## Enabling Demo Mode

### 1. Set Environment Variables

#### Next.js Client-Side (`.env.local`)

Add to your `.env.local` file:

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

This enables demo mode detection in the frontend (React components).

#### Convex Server-Side

Set the Convex environment variable:

```bash
npx convex env set DEMO_MODE true
```

This enables demo mode in Convex functions (mutations, actions, queries).

### 2. Verify Demo Mode

After setting the environment variables:

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

## Sample Data Structure

### Emails

Sample emails include:
- Mix of inbox (received) and sent emails
- Threaded conversations (3-4 threads with 2-3 replies each)
- Various subjects: work, personal, newsletters, notifications
- Mix of read/unread, starred/unstarred
- Some archived, some in trash
- Realistic HTML and text bodies
- Proper messageId, threadId, inReplyTo, references headers

### Contacts

Sample contacts include:
- Mix of personal and professional contacts
- Some with enrichment data (company, title, notes)
- Some with tags
- Various lastContactedAt timestamps
- Realistic email addresses and names

## API Reference

### Public Actions

- `api.demo.seedDemo()` - Seed demo emails and contacts
- `api.demo.resetDemo()` - Clear and reseed demo data

Both actions require:
- Authentication (`requireUserId`)
- Demo mode enabled (`DEMO_MODE === "true"`)

### Internal Mutations

- `internal.demo.seed.seedDemoEmails()` - Seed emails only
- `internal.demo.seed.seedDemoContacts()` - Seed contacts only
- `internal.demo.seed.clearDemoData()` - Clear all data
- `internal.demo.seed.addDemoEmail()` - Add single email

All internal mutations check `DEMO_MODE === "true"` before executing.

