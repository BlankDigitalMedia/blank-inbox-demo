# Deployment Guide for OSS Release

This guide will help you deploy Blank Inbox to a new GitHub repository and Vercel.

## Current Status

✅ **Completed:**
- All changes committed locally
- Old git remote removed (`BlankDigitalMedia/blank-inbox`)
- Package.json set to `"private": false` for OSS

## Next Steps

### 1. Create New GitHub Repository

1. Go to [GitHub](https://github.com/new) and create a new repository
2. **Important:** Do NOT initialize with README, .gitignore, or license (we already have these)
3. Choose public visibility for OSS
4. Copy the repository URL (e.g., `https://github.com/your-username/blank-inbox.git`)

### 2. Connect Local Repo to New Remote

Run these commands in your terminal:

```bash
cd /Users/davidblank/Documents/blank-blog/blank-inbox

# Add the new remote (replace with your actual repo URL)
git remote add origin https://github.com/your-username/blank-inbox.git

# Push to the new repository
git push -u origin main
```

### 3. Update README Placeholder Links

After creating your repo, update these lines in `README.md`:

```markdown
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)
```

Replace `your-repo` with your actual repository path (e.g., `your-username/blank-inbox`).

### 4. Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure environment variables (see below)
5. Deploy!

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel

# Follow the prompts to link your project
```

### 5. Environment Variables for Vercel

Add these environment variables in Vercel dashboard (Settings → Environment Variables):

**Required:**
- `CONVEX_DEPLOYMENT` - Your Convex deployment URL
- `CONVEX_URL` - Your Convex URL (usually same as deployment)
- `NEXT_PUBLIC_CONVEX_URL` - Public Convex URL (same as above)

**Email Provider (choose one or both):**
- `RESEND_API_KEY` - For Resend email service
- `NEXT_INBOUND_API_KEY` - For inbound.new email service

**Webhook Security:**
- `INBOUND_WEBHOOK_SECRET` - Secret key for webhook authentication

**Optional:**
- `NEXT_PUBLIC_DEMO_MODE` - Set to `"true"` to enable demo mode
- `DEMO_MODE` - Set to `"true"` for Convex demo mode (must match client setting)
- `ADMIN_EMAIL` - Optional admin email restriction for signups

**OpenAI (for enrichment):**
- `OPENAI_API_KEY` - Required for AI-powered contact enrichment

### 6. Convex Deployment

Make sure your Convex project is deployed:

```bash
# If using Convex CLI
npx convex deploy

# Or configure in Convex dashboard
```

### 7. Webhook Configuration

After deployment, configure your email provider webhooks:

1. **Resend:** Set webhook URL to `https://your-vercel-app.vercel.app/inbound`
   - Add header: `X-Webhook-Secret` with your `INBOUND_WEBHOOK_SECRET` value

2. **inbound.new:** Set webhook URL to `https://your-vercel-app.vercel.app/inbound`
   - Add header: `X-Webhook-Secret` with your `INBOUND_WEBHOOK_SECRET` value

### 8. Post-Deployment Checklist

- [ ] Repository is public and accessible
- [ ] README placeholder links updated
- [ ] Vercel deployment successful
- [ ] Environment variables configured
- [ ] Convex deployment active
- [ ] Webhook endpoints configured
- [ ] Test email sending/receiving
- [ ] Test authentication flow

## Troubleshooting

### Vercel Build Fails
- Check that all environment variables are set
- Verify Convex deployment is active
- Check build logs for specific errors

### Webhook Not Working
- Verify `INBOUND_WEBHOOK_SECRET` matches in both Vercel and email provider
- Check webhook URL is correct (should be `/inbound` endpoint)
- Review Convex logs for webhook errors

### Authentication Issues
- Ensure Convex Auth is properly configured
- Check that `CONVEX_URL` environment variables are set correctly

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

