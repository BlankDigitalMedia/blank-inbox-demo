/**
 * ROUTE PROTECTION PROXY (Next.js 16 convention)
 * 
 * Replaces middleware.ts in Next.js 16+ for authentication guards.
 * 
 * PROTECTION STRATEGY:
 * - All routes protected by default except /signin
 * - Unauthenticated users redirected to /signin
 * - Authenticated users redirected from /signin to /
 * - 30-day persistent cookie sessions (maxAge: 30 * 24 * 60 * 60)
 * - DEMO MODE: Bypasses all authentication checks
 * - No additional request size/time limits needed (handled by Convex/Next.js)
 * 
 * ROUTE COVERAGE:
 * - Protected: /, /sent, /starred, /archive, /drafts, /trash, /compose
 * - Public: /signin
 * - Excluded: /_next, /favicon.ico, /robots.txt, static assets
 * 
 * Note: This is a client-side redirect guard only. All server-side operations
 * enforce auth via requireUserId() in Convex queries/mutations/actions.
 */
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicPage = createRouteMatcher(["/signin"]);
const isProtectedPage = createRouteMatcher([
  "/",
  "/sent",
  "/starred",
  "/archive",
  "/drafts",
  "/trash",
  "/compose",
]);

// Check if demo mode is enabled
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // In demo mode, bypass all authentication checks
  if (isDemoMode) {
    // Redirect from signin to home in demo mode
    if (isPublicPage(request)) {
      return nextjsMiddlewareRedirect(request, "/");
    }
    // Allow all other routes
    return;
  }

  // Normal auth flow for non-demo mode
  if (isProtectedPage(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }

  if (isPublicPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
}, { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } });

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|.*\\..*).*)"],
};

