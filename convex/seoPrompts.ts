import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { AI_ENGINES, DEFAULT_AI_ENGINES, aiEngineValidator, isAiEngine } from "./seoAiEngines";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The questions we put to the AI engines, per website.
 *
 * A prompt belongs to a site rather than to a company, because "best plumber in
 * Leeds" is about one shop and not about an agency holding four of them.
 *
 * **What is bought is the prompt; the brand is what gets read out of it.** The
 * answer names everyone it names, so one purchase serves every tracked site
 * that appears in it. Two agencies watching the same market pay once between
 * them, exactly as they do for a host.
 */

/** The longest a prompt may be. It is sent verbatim, so it is bounded at save. */
export const MAX_PROMPT_LENGTH = 300;

/** The shortest question worth asking an engine. */
export const MIN_PROMPT_LENGTH = 8;

/**
 * How many questions one website may track, by default.
 *
 * **Deliberately not a restriction at the moment.** Each question is a paid
 * call per engine per collection, so this is the meter that decides what AI
 * citation tracking costs — and the number it should be set to is unknown
 * until real invoices arrive. Anthony, 2026-09-22: "For pricing let's leave it
 * for now and see what real costs start to come through and we can revisit. As
 * long as all transactions are stored and logged and visible... I want the
 * platform unrestricted until we have this review."
 *
 * So the mechanism stays and the number is set high enough not to bite. It was
 * ten, which is the figure to come back to when the plan meters are decided:
 * ten questions across four engines is forty charges every time a website is
 * collected. Spend is on the ledger, the pulls list and the cost screens
 * throughout, which is the condition that made lifting it safe.
 *
 * Settable by a super admin rather than frozen, following the pattern approval
 * expiry and purge retention already use — a `systemConfig` row, a validated
 * setter with a hard floor and ceiling, and a section on the settings screen.
 */
export const DEFAULT_PROMPTS_PER_WEBSITE = 1_000;

/** Below this the feature does nothing, so it is not a setting, it is "off". */
export const MIN_PROMPTS_PER_WEBSITE = 1;

/**
 * The most a super admin may set it to.
 *
 * A hard ceiling on the setting itself, not just on the form. It was fifty,
 * for the good reason that a typed extra zero should be refused rather than
 * billed; it is raised with the default above while the platform is
 * deliberately unrestricted, and it is also what bounds how many questions one
 * collection reads per website, so the two must move together.
 */
export const MAX_PROMPTS_PER_WEBSITE = 1_000;

/**
 * The allowance in force for one company, which comes from its plan.
 *
 * **On the plan rather than on the company or the platform.** It is the same
 * kind of thing as a message limit: what a tier includes. A company with no
 * plan, or on a plan written before this existed, gets the platform default, so
 * nothing behaves as though the allowance were zero.
 *
 * Applied *per owned website*, so a client with four sites on a plan allowing
 * ten may track forty questions in total.
 *
 * Read wherever it is enforced rather than passed in, so the limit cannot be
 * enforced in one place and displayed from another — which is how a screen
 * comes to promise an allowance the server refuses.
 */
export async function promptsPerWebsite(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
): Promise<number> {
  const company = await ctx.db.get(companyId);
  const plan = company?.planId ? await ctx.db.get(company.planId) : null;
  const stored = plan?.seoPromptsPerWebsite;
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return DEFAULT_PROMPTS_PER_WEBSITE;
  }
  return Math.min(Math.max(Math.floor(stored), MIN_PROMPTS_PER_WEBSITE), MAX_PROMPTS_PER_WEBSITE);
}

export const getPromptAllowance = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({
    perWebsite: v.number(),
    /** True when the plan says nothing and the platform default is in force. */
    isDefault: v.boolean(),
    planName: v.union(v.string(), v.null()),
    defaultPerWebsite: v.number(),
  }),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    const plan = company?.planId ? await ctx.db.get(company.planId) : null;

    return {
      perWebsite: await promptsPerWebsite(ctx, args.companyId),
      isDefault: typeof plan?.seoPromptsPerWebsite !== "number",
      planName: plan?.name ?? null,
      defaultPerWebsite: DEFAULT_PROMPTS_PER_WEBSITE,
    };
  },
});

const promptRow = v.object({
  _id: v.id("trackedPrompts"),
  _creationTime: v.number(),
  prompt: v.string(),
  engines: v.array(aiEngineValidator),
  isActive: v.boolean(),
  createdAt: v.number(),
});

/** Trim and collapse, so two prompts differing only in spacing are one. */
function readPrompt(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export const listTrackedPrompts = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(promptRow),
    totalCount: v.number(),
    totalPages: v.number(),
    /** How many more this website may add, so a screen can say so before saving. */
    remaining: v.number(),
    /** What the plan allows per website, and how many are actually here. */
    allowance: v.number(),
    used: v.number(),
    /**
     * True when this website holds more questions than its plan now allows.
     *
     * It happens by downgrade rather than by anybody breaking a rule: a client
     * on ten questions moved to a plan allowing five keeps their ten. Nothing
     * is trimmed, because silently stopping a question is the kind of thing
     * somebody notices weeks later as a gap in a chart nobody can explain. So
     * it is shown instead, and whether to trim it is a decision a person makes.
     */
    isOverAllowance: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    const allowance = await promptsPerWebsite(ctx, companyWebsite.companyId);
    const rows = await ctx.db
      .query("trackedPrompts")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .order("desc")
      .take(MAX_PROMPTS_PER_WEBSITE + 1);

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term ? rows.filter((row) => includesSearchTerm(row.prompt, term)) : rows;

    return {
      ...paginateItems(
        matching.map((row) => ({
          _id: row._id,
          _creationTime: row._creationTime,
          prompt: row.prompt,
          engines: row.engines,
          isActive: row.isActive,
          createdAt: row.createdAt,
        })),
        args.page,
        args.pageSize,
      ),
      remaining: Math.max(0, allowance - rows.length),
      allowance,
      used: rows.length,
      isOverAllowance: rows.length > allowance,
    };
  },
});

export const addTrackedPrompt = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    prompt: v.string(),
    engines: v.optional(v.array(v.string())),
  },
  returns: v.id("trackedPrompts"),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    const prompt = readPrompt(args.prompt);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", "Write the question as somebody would actually ask it.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw appError(
        "INVALID_INPUT",
        `A question can be at most ${MAX_PROMPT_LENGTH} characters.`,
      );
    }

    const allowance = await promptsPerWebsite(ctx, companyWebsite.companyId);
    const existing = await ctx.db
      .query("trackedPrompts")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(MAX_PROMPTS_PER_WEBSITE + 1);

    // The ceiling is here and not only in the form, because each question is a
    // paid call per engine per collection and a limit living in a screen is a
    // limit the next caller does not have.
    if (existing.length >= allowance) {
      throw appError(
        "INVALID_INPUT",
        `This website can track at most ${allowance} questions.`,
      );
    }
    if (existing.some((row) => row.prompt.toLowerCase() === prompt.toLowerCase())) {
      throw appError("INVALID_INPUT", "That question is already being asked for this website.");
    }

    const chosen = (args.engines ?? []).filter(isAiEngine);
    const engines = chosen.length > 0 ? chosen : [...DEFAULT_AI_ENGINES];

    const promptId = await ctx.db.insert("trackedPrompts", {
      companyWebsiteId: args.companyWebsiteId,
      companyId: companyWebsite.companyId,
      websiteId: companyWebsite.websiteId,
      prompt,
      engines,
      isActive: true,
      createdAt: Date.now(),
      createdBy: ctx.userId,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_TRACKED_PROMPT",
      entityId: promptId,
      entityType: "trackedPrompts",
      companyId: companyWebsite.companyId,
      metadata: JSON.stringify({ prompt, engines }),
      timestamp: Date.now(),
    });

    return promptId;
  },
});

export const setTrackedPromptActive = superAdminMutation({
  args: { promptId: v.id("trackedPrompts"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.promptId);
    if (!row) throw appError("NOT_FOUND", "That question no longer exists.");

    // Switched off rather than deleted, so the answers already collected keep
    // the question that produced them.
    await ctx.db.patch(args.promptId, { isActive: args.isActive });
    return null;
  },
});

export const removeTrackedPrompt = superAdminMutation({
  args: { promptId: v.id("trackedPrompts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.promptId);
    if (!row) return null;

    await ctx.db.delete(args.promptId);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_TRACKED_PROMPT",
      entityId: args.promptId,
      entityType: "trackedPrompts",
      companyId: row.companyId,
      metadata: JSON.stringify({ prompt: row.prompt }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/** Every engine a screen may offer, so the list lives in one place. */
export const listAiEngines = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async () => [...AI_ENGINES],
});
