# Blank Inbox

A modern, self-hosted email client built with Next.js, Convex, and React. Designed for **single-tenant** use—one instance per user.

## Features

- 📧 Full email inbox with send/receive capabilities
- 🔐 Secure password-based authentication (single user)
- 📝 Rich text email composer with drafts
- 🏷️ Email organization: Archive, Star, Trash, Drafts
- 🧵 Email threading support
- 👥 Contacts management: auto-create from emails, manual edit with tags and notes
- 🔍 AI-powered contact enrichment: enrich contacts with company and person data using multi-agent pipeline (company profile, funding, tech stack, person info)
- 🌓 Dark/light theme toggle
- 📱 Responsive design
- 🔒 HTML email sanitization (XSS protection)
- ⚡ Real-time updates with Convex

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Convex account** (free tier available at [convex.dev](https://convex.dev))
- **Email provider** (choose one or both):
  - [Resend](https://resend.com) for sending/receiving
  - [inbound.new](https://inbound.new) for sending/receiving

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd blank-inbox
npm install
```

### 2. Set Up Convex

```bash
# Login to Convex
npx convex login

# Initialize project (creates convex deployment)
npx convex dev
```

This will:
- Create a new Convex project (or link existing)
- Output your `NEXT_PUBLIC_CONVEX_URL`
- Start watching for schema changes

### 3. Configure Environment Variables

Create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

```env
# Required: Your Convex deployment URL (from step 2)
NEXT_PUBLIC_CONVEX_URL=https://[your-project].convex.cloud

# Optional: Restrict signup to specific email
ADMIN_EMAIL=your-email@example.com

# Optional: Enable demo mode (see Demo Mode section below)
NEXT_PUBLIC_DEMO_MODE=true
```

**Set email provider keys in Convex** (for backend access):

```bash
npx convex env set RESEND_API_KEY re_your_resend_api_key
npx convex env set NEXT_INBOUND_API_KEY sk_your_inbound_api_key

# Optional: Set enrichment API keys (for contact enrichment feature)
npx convex env set FIRECRAWL_API_KEY fc_your_firecrawl_api_key
npx convex env set OPENAI_API_KEY sk_your_openai_api_key

# Required: Set webhook secret for security
npx convex env set INBOUND_WEBHOOK_SECRET $(openssl rand -hex 32)

# Optional: Set ADMIN_EMAIL in Convex
npx convex env set ADMIN_EMAIL your-email@example.com

# Optional: Enable demo mode in Convex
npx convex env set DEMO_MODE true
```

See [`.env.example`](.env.example) for complete environment variable documentation.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Create Your Account

1. You'll be redirected to `/signin`
2. Click "Sign up"
3. Enter your email and password
4. Click "Sign Up"

**Note:** Only the **first signup** is allowed. After that, the instance is locked to a single user. If you set `ADMIN_EMAIL`, only that email can sign up.

**Demo Mode:** If `DEMO_MODE=true` is set, multiple users can sign up and email sending is mocked. See [Demo Mode](#demo-mode) section below.

### 6. Configure Email Webhooks (for receiving)

To receive emails, configure your provider's webhook:

**Webhook URL:** `https://your-convex-deployment.convex.cloud/inbound`

**For Resend:**
1. Go to [Resend Dashboard → Webhooks](https://resend.com/webhooks)
2. Add webhook URL: `https://your-convex-deployment.convex.cloud/inbound`
3. Subscribe to `email.received` events
4. Add custom header: `X-Webhook-Secret` = (your `INBOUND_WEBHOOK_SECRET` value)

**For inbound.new:**
1. Go to [inbound.new Dashboard](https://inbound.new/dashboard)
2. Set webhook URL: `https://your-convex-deployment.convex.cloud/inbound`
3. Add custom header: `X-Webhook-Secret` = (your `INBOUND_WEBHOOK_SECRET` value)
4. Configure your inbound email address

---

## Demo Mode

Blank Inbox includes an **optional** demo mode that allows visitors to try the application without requiring real email provider API keys or webhook configuration.

Demo mode code is located in `examples/demo/` and can be safely ignored if you don't need it.

### Features

- **Mocked Email Sending**: Emails are stored locally but not actually sent
- **Multiple Users**: Bypasses single-user restriction (for demo purposes)
- **Pre-seeded Data**: Sample emails and contacts included
- **Easy Reset**: Reset demo data with one click

### Quick Setup

1. **Enable demo mode** in `.env.local`:
   ```bash
   NEXT_PUBLIC_DEMO_MODE=true
   ```

2. **Enable demo mode in Convex**:
   ```bash
   npx convex env set DEMO_MODE true
   ```

3. **Restart servers** and visit the app - demo banner will appear at the top

4. **Seed demo data** by clicking "Reset Demo Data" in the banner

### Demo User

Suggested demo credentials:
- Email: `demo@blankinbox.dev`
- Password: `demo123`

Or use any email/password combination.

### Documentation

For complete demo mode documentation, see [examples/demo/README.md](examples/demo/README.md).

---

## Architecture

### Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend:** Convex (serverless functions + database)
- **Auth:** @convex-dev/auth with Password provider
- **UI:** shadcn/ui, Radix UI, Tailwind CSS
- **Email:** Dual-provider support (Resend + inbound.new)
- **Rich Text:** TipTap editor

### Key Directories

```
blank-inbox/
├── app/                 # Next.js App Router pages
│   ├── signin/         # Authentication page
│   ├── compose/        # Email composition
│   └── [other views]   # Inbox, sent, archive, etc.
├── components/          # React components
│   ├── composer/       # Email composer component
│   └── ui/             # shadcn/ui components
├── convex/             # Convex backend
│   ├── auth.ts         # Authentication logic
│   ├── emails.ts       # Email queries/mutations
│   ├── contacts.ts     # Contact queries/mutations
│   └── schema.ts       # Database schema
├── docs/               # Documentation
│   ├── AUTH_CONTRACT.md
│   ├── TESTING.md
│   └── SECURITY.md
└── lib/                # Utilities
```

---

## Email Provider Setup

### Option 1: Resend (Recommended for sending)

1. Sign up at [resend.com](https://resend.com)
2. Get API key from [API Keys page](https://resend.com/api-keys)
3. Set `RESEND_API_KEY` in `.env.local` and Convex
4. Configure webhook for receiving (see step 6 above)

### Option 2: inbound.new (Great for receiving)

1. Sign up at [inbound.new](https://inbound.new)
2. Get API key from dashboard
3. Set `NEXT_INBOUND_API_KEY` in `.env.local` and Convex
4. Configure your inbound email address
5. Set webhook URL to your Convex deployment's `/inbound` endpoint (e.g., `https://your-convex-deployment.convex.cloud/inbound`)

### Dual-Provider Setup (Best of both)

- Use **Resend** for sending (more reliable)
- Use **inbound.new** for receiving (simpler setup)
- Set both API keys—app will automatically use the right one

---

## Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com/new)
3. Set environment variables:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `ADMIN_EMAIL` (optional)
4. Set Convex environment variables (see step 3 above)
5. Deploy!
6. Configure email webhooks with your Vercel URL

### Deploy Elsewhere

Blank Inbox works on any Node.js hosting platform:

- **Cloudflare Pages** (with Node.js)
- **Railway**
- **Render**
- **Self-hosted VPS**

Requirements:
- Node.js 18+ runtime
- HTTPS (for webhooks and secure cookies)
- Environment variables support

---

## Security Notes

🔒 **Single-Tenant Design:** This app is designed for ONE user per instance. If you need multi-user support, deploy separate instances.

🔒 **Password Security:** Passwords are hashed with bcrypt. No plaintext storage.

🔒 **XSS Protection:** Email HTML is sanitized with DOMPurify before rendering.

🔒 **HTTPS Required:** Always use HTTPS in production for secure authentication.

🔒 **Webhook Security:** Consider IP whitelisting or signature verification for webhooks.

📖 **Read more:** [docs/SECURITY.md](docs/SECURITY.md)

---

## Development

### Available Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Testing

See [docs/TESTING.md](docs/TESTING.md) for manual testing guide.

---

## Troubleshooting

### "Signup is disabled" error

This means a user already exists. This is by design—only one user per instance.

**To reset:**
1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Select your project → Data → `users` table
3. Delete all users
4. Refresh `/signin` and sign up again

### Emails not appearing

1. Check Convex logs: `npx convex logs`
2. Verify webhook URL is correct (HTTPS, publicly accessible)
3. Test webhook with provider's test tool
4. Verify API keys are set in Convex: `npx convex env list`

### Authentication issues

1. Clear browser cookies
2. Verify `NEXT_PUBLIC_CONVEX_URL` is set correctly
3. Check proxy.ts is protecting routes (Next.js 16+ uses proxy.ts instead of middleware.ts)
4. Run `npx convex dev` to ensure schema is deployed

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- 📖 Documentation: [docs/](docs/)
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**Built with ❤️ using Next.js, Convex, and shadcn/ui**
