import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "@/lib/types";
import { logSecurity } from "@/lib/logger";

/**
 * Demo-friendly requireUserId
 *
 * For the demo, authentication should never block usage. This helper will
 * return the authenticated user id when present; otherwise it will return a
 * stable dummy id so queries/mutations can proceed without throwing.
 */
export async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId) {
    return userId;
  }

  // Demo: fall back to a dummy user id so the app keeps working without auth
  return "demo-user-id" as string;
}
