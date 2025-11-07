/**
 * Demo Mode Utilities
 * 
 * Provides type-safe demo mode detection for both client and server environments.
 * 
 * SAFETY: Uses strict string comparison (=== "true") to prevent accidental activation
 * from truthy values like "1", "yes", empty strings, etc.
 */

/**
 * Check if demo mode is enabled on the client side
 * 
 * Uses NEXT_PUBLIC_DEMO_MODE environment variable (exposed to browser)
 * 
 * @returns true only if NEXT_PUBLIC_DEMO_MODE is exactly "true"
 */
export function isDemoMode(): boolean {
  if (typeof window === "undefined") {
    // Server-side: return false (client-side check only)
    return false;
  }
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/**
 * Check if demo mode is enabled on the server side (Convex)
 * 
 * Uses DEMO_MODE environment variable (Convex server-side only)
 * This function is intended for use in Convex functions.
 * 
 * @returns true only if DEMO_MODE is exactly "true"
 */
export function isDemoModeServer(): boolean {
  return process.env.DEMO_MODE === "true";
}

