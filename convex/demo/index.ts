/**
 * Demo Mode Public Actions
 * 
 * Public-facing actions for seeding and resetting demo data.
 * Requires authentication and DEMO_MODE to be enabled.
 * 
 * SAFETY: Double-gated - requires both authentication and DEMO_MODE === "true"
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUserId } from "../lib/auth";

/**
 * Check if demo mode is enabled (server-side)
 */
function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Seed demo data (emails and contacts)
 * 
 * Public action that calls internal seed mutations.
 * Requires authentication and DEMO_MODE to be enabled.
 */
export const seedDemo = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    emails: { success: boolean; count: number; message: string };
    contacts: { success: boolean; count: number; message: string };
    message: string;
  }> => {
    // Require authentication
    await requireUserId(ctx);

    // Require demo mode
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    // Seed emails and contacts
    const emailsResult = await ctx.runMutation(internal.demo.seed.seedDemoEmails);
    const contactsResult = await ctx.runMutation(internal.demo.seed.seedDemoContacts);

    return {
      success: true,
      emails: emailsResult,
      contacts: contactsResult,
      message: `Demo data seeded: ${emailsResult.count} emails, ${contactsResult.count} contacts`,
    };
  },
});

/**
 * Reset demo data (clear and reseed)
 * 
 * Public action that clears all data and reseeds demo content.
 * Requires authentication and DEMO_MODE to be enabled.
 */
export const resetDemo = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    cleared: { success: boolean; emailsDeleted: number; contactsDeleted: number; message: string };
    emails: { success: boolean; count: number; message: string };
    contacts: { success: boolean; count: number; message: string };
    message: string;
  }> => {
    // Require authentication
    await requireUserId(ctx);

    // Require demo mode
    if (!isDemoModeEnabled()) {
      throw new Error("Demo mode is not enabled. Set DEMO_MODE=true in Convex environment variables.");
    }

    // Clear existing data
    const clearResult = await ctx.runMutation(internal.demo.seed.clearDemoData);

    // Reseed demo data
    const emailsResult = await ctx.runMutation(internal.demo.seed.seedDemoEmails);
    const contactsResult = await ctx.runMutation(internal.demo.seed.seedDemoContacts);

    return {
      success: true,
      cleared: clearResult,
      emails: emailsResult,
      contacts: contactsResult,
      message: `Demo data reset: cleared ${clearResult.emailsDeleted} emails and ${clearResult.contactsDeleted} contacts, reseeded ${emailsResult.count} emails and ${contactsResult.count} contacts`,
    };
  },
});
