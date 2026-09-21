import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";

/**
 * The Google live voices Hakken can speak with. Declared here — not in
 * ai.ts — because that file runs under Node ("use node") and this one
 * cannot: queries and mutations live in the default runtime, and a
 * default-runtime file must not import a Node one.
 */
export const SPEECH_VOICE_KEYS = ["Kore", "Puck", "Charon", "Aoede"] as const;
export type SpeechVoiceKey = (typeof SPEECH_VOICE_KEYS)[number];

/**
 * One voice for everywhere Hakken speaks.
 *
 * Ask Hakken's voice overlay, the phone line and the reception screen all
 * mint their live sessions from the same relay, and each used to fall back
 * to a hard-coded voice of its own. This is the single setting they all
 * read instead: change it once, and Hakken sounds the same at every door.
 * Stored on the company, because a workspace should sound like itself —
 * and two workspaces need not sound alike.
 */

/** The voice every spoken session falls back to when none has been chosen. */
export const DEFAULT_SPOKEN_VOICE: SpeechVoiceKey = "Aoede";

/** How each voice reads on the admin screen — a name alone says nothing. */
export const SPOKEN_VOICE_DESCRIPTIONS: Record<SpeechVoiceKey, string> = {
  Kore: "Firm and clear",
  Puck: "Upbeat and bright",
  Charon: "Deep and steady",
  Aoede: "Warm and easy — the default",
};

export const getSpokenVoice = tenantQuery({
  args: {},
  returns: governanceShapes.spokenVoiceShape,
  handler: async (
    ctx
  ): Promise<{ voice: string; options: Array<{ key: string; description: string }> }> => {
    const { companyId } = ctx;
    const company = companyId ? await ctx.db.get(companyId) : null;
    return {
      voice: company?.spokenVoice ?? DEFAULT_SPOKEN_VOICE,
      options: SPEECH_VOICE_KEYS.map((key) => ({
        key,
        description: SPOKEN_VOICE_DESCRIPTIONS[key],
      })),
    };
  },
});

export const setSpokenVoice = adminMutation({
  args: { voice: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, userId } = ctx;
    if (!SPEECH_VOICE_KEYS.includes(args.voice as SpeechVoiceKey)) {
      throw appError("INVALID_INPUT", "That voice is not one the platform can speak with.");
    }
    const companyId = getActiveCompanyId(user);
    if (!companyId) throw appError("NO_ACTIVE_COMPANY", "No workspace to set the voice for.");
    const company = await ctx.db.get(companyId);
    if (!company) throw appError("NOT_FOUND", "Workspace not found.");

    await ctx.db.patch(companyId, { spokenVoice: args.voice });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_SPOKEN_VOICE",
      entityId: companyId,
      entityType: "companies",
      // The change itself, not the conversation around it.
      metadata: JSON.stringify({ from: company.spokenVoice ?? null, to: args.voice }),
      companyId,
      timestamp: Date.now(),
    });
  },
});

/** The voice a live session should speak with — every mint point asks here. */
export const getSpokenVoiceForCompany = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<string> => {
    const company = args.companyId ? await ctx.db.get(args.companyId) : null;
    return company?.spokenVoice ?? DEFAULT_SPOKEN_VOICE;
  },
});
