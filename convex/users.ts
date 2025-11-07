import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { DEFAULT_INCOMING, DEFAULT_OUTGOING, isValidSoundId } from "@/lib/sounds";

export const count = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.length;
  },
});

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    
    const settings = await ctx.db
      .query("user_settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    
    if (!settings) {
      return {
        incomingSound: DEFAULT_INCOMING,
        outgoingSound: DEFAULT_OUTGOING,
      };
    }

    return {
      incomingSound: settings.incomingSound && isValidSoundId(settings.incomingSound)
        ? settings.incomingSound
        : DEFAULT_INCOMING,
      outgoingSound: settings.outgoingSound && isValidSoundId(settings.outgoingSound)
        ? settings.outgoingSound
        : DEFAULT_OUTGOING,
    };
  },
});

export const updateSettings = mutation({
  args: {
    incomingSound: v.optional(v.string()),
    outgoingSound: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    
    if (args.incomingSound !== undefined && !isValidSoundId(args.incomingSound)) {
      throw new Error(`Invalid incoming sound ID: ${args.incomingSound}`);
    }
    
    if (args.outgoingSound !== undefined && !isValidSoundId(args.outgoingSound)) {
      throw new Error(`Invalid outgoing sound ID: ${args.outgoingSound}`);
    }

    const existing = await ctx.db
      .query("user_settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const incomingSound = args.incomingSound ?? existing?.incomingSound ?? DEFAULT_INCOMING;
    const outgoingSound = args.outgoingSound ?? existing?.outgoingSound ?? DEFAULT_OUTGOING;

    if (existing) {
      await ctx.db.patch(existing._id, {
        incomingSound,
        outgoingSound,
      });
    } else {
      await ctx.db.insert("user_settings", {
        userId,
        incomingSound,
        outgoingSound,
      });
    }
  },
});
