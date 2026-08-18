import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, TableNames } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { GOVERNANCE_READ_ROLES, getActiveCompanyId, getCurrentUser } from "./authz";
import { isModuleEnabled } from "./utils/companyModules";
import { CORE_MODULES } from "./utils/coreModules";
import { publicMutation, publicQuery } from "./tenantFunctions";
import {
  withAuditLogActorName,
  auditChangesFrom,
  auditDetailsFrom,
  describeAuditChange,
} from "./auditLogService";

// 1. Log an action
export const logAction = internalMutation({
  args: {
    actorId: v.id("users"),
    actionType: v.string(),
    entityId: v.optional(v.string()),
    entityType: v.string(),
    metadata: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      ...args,
      timestamp: Date.now()
    });
  }
});

// 6. View Recent Logs (UI Feed)
export const getRecentLogs = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    // The audit trail is a governance surface, so the oversight roles read it.
    // It was super-admin only, which meant the one screen an auditor exists to
    // look at was the one screen they could not open.
    const current = await getCurrentUser(ctx);
    const role = current?.user.role;
    if (!role || !GOVERNANCE_READ_ROLES.includes(role as (typeof GOVERNANCE_READ_ROLES)[number])) return [];

    /**
     * Whose records these are.
     *
     * Widening this query beyond super admins made the scope question real:
     * `GOVERNANCE_READ_ROLES` includes `ADMIN`, and a company administrator
     * reading the unscoped trail would have seen every other tenant's
     * activity. Platform-wide reach belongs to the two platform roles; anyone
     * else sees their own workspace and nothing else.
     */
    const platformWide = role === "SUPER_ADMIN" || role === "READ_ONLY";
    const companyId = getActiveCompanyId(current.user);

    if (!platformWide && !companyId) return [];

    // Withheld capability reads as empty, matching this surface's soft contract.
    if (!platformWide && companyId) {
      const company = await ctx.db.get(companyId);
      if (!isModuleEnabled(company, CORE_MODULES.governance)) return [];
    }

    const logs = platformWide
      ? await ctx.db.query("auditLogs").withIndex("by_timestamp").order("desc").take(500)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .order("desc")
          .take(500);
      
    return await Promise.all(logs.map(async (log) => {
      // Some entries have no human behind them — a blocked widget embed is an
      // anonymous request. `withAuditLogActorName` already renders that.
      const actor = log.actorId ? await ctx.db.get(log.actorId) : null;
      return withAuditLogActorName(log, actor);
    }));
  }
});

/**
 * One row, with the three things a reader had to open it to find out.
 *
 * Who it was done to, which workspace it belonged to, and what happened. The
 * list carried none of them, so answering "what did this person do in that
 * client's workspace last month" meant opening rows one at a time.
 *
 * The target is named where it can be. `normalizeId` rather than a bare read,
 * because `entityType` is a plain string on the row and nothing guarantees the
 * two still line up; an entry pointing at a table that has since been renamed
 * keeps its identifier rather than failing.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
async function describeAuditRow(ctx: QueryCtx, log: Doc<"auditLogs">) {
  const [actor, company] = await Promise.all([
    log.actorId ? ctx.db.get(log.actorId) : null,
    log.companyId ? ctx.db.get(log.companyId) : null,
  ]);

  let targetName: string | null = null;
  if (log.entityId) {
    const normalised = ctx.db.normalizeId(log.entityType as TableNames, log.entityId);
    if (normalised) {
      const target = (await ctx.db.get(normalised)) as Record<string, unknown> | null;
      const named = target?.name ?? target?.title ?? target?.email;
      targetName = typeof named === "string" && named.trim() !== "" ? named : null;
    }
  }

  return {
    ...withAuditLogActorName(log, actor),
    targetName,
    companyName: company?.name ?? null,
    change: describeAuditChange(log.metadata, log.actionType),
  };
}

/**
 * The trail, paged properly.
 *
 * `getRecentLogs` reads the newest five hundred and stops, which the screen
 * then paged through — so the footer read "of 500 entries" however much had
 * actually happened, and nothing older could be reached or searched. Anthony,
 * 2026-08-06, looking at that footer: *"its not much of an audit trail."*
 *
 * The date range goes into the index rather than being filtered afterwards, so
 * asking for last month costs last month. Action and person are matched per
 * page, which can return a short page but never a wrong one.
 *
 * No total is returned, deliberately. Counting every matching row to print a
 * number would read the whole table on every page turn, and the previous
 * screen's confident "of 500" is exactly the kind of figure this section should
 * not print when it cannot stand behind it.
 */
export const getAuditPage = publicQuery({
  reason:
    "Returns an empty page rather than throwing when the caller lacks a session or an oversight role, so the screen renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {
    paginationOpts: paginationOptsValidator,
    actionType: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empty = { page: [], isDone: true, continueCursor: "" };

    const current = await getCurrentUser(ctx);
    const role = current?.user.role;
    if (!role || !GOVERNANCE_READ_ROLES.includes(role as (typeof GOVERNANCE_READ_ROLES)[number])) {
      return empty;
    }

    const platformWide = role === "SUPER_ADMIN" || role === "READ_ONLY";
    const companyId = getActiveCompanyId(current.user);
    if (!platformWide && !companyId) return empty;

    const from = args.from ?? 0;
    const to = args.to ?? Number.MAX_SAFE_INTEGER;

    const results = platformWide
      ? await ctx.db
          .query("auditLogs")
          .withIndex("by_timestamp", (q) => q.gte("timestamp", from).lte("timestamp", to))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_company", (q) =>
            q.eq("companyId", companyId).gte("timestamp", from).lte("timestamp", to),
          )
          .order("desc")
          .paginate(args.paginationOpts);

    const needle = (args.search ?? "").trim().toLowerCase();

    const page = await Promise.all(results.page.map((log) => describeAuditRow(ctx, log)));

    return {
      ...results,
      page: page.filter((log) => {
        if (args.actionType && log.actionType !== args.actionType) return false;
        if (args.actorId && log.actorId !== args.actorId) return false;
        // Only meaningful for the platform roles. A workspace administrator is
        // already pinned to their own by the index above.
        if (args.companyId && log.companyId !== args.companyId) return false;
        if (!needle) return true;

        // Matched against what the row actually shows. Searching a field the
        // reader cannot see returns rows that look like mistakes.
        return [
          log.actionType,
          log.actorName ?? "",
          log.change,
          log.targetName ?? log.entityId ?? "",
          log.companyName ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }),
    };
  },
});

/**
 * The lists the filters offer.
 *
 * People and workspaces come from their own tables, so the filter offers
 * everyone who could appear rather than everyone who happens to be on the page
 * the reader is looking at.
 *
 * Actions cannot work that way — there is no table of them, only whatever the
 * platform has written. They are read from a bounded window of recent entries,
 * which is a real limit and is stated here rather than hidden: an action last
 * used a very long time ago will not be offered, though searching for it still
 * finds it.
 */
const AUDIT_ACTION_SCAN_LIMIT = 2000;

export const getAuditFilterOptions = publicQuery({
  reason:
    "Returns empty lists rather than throwing when the caller lacks a session or an oversight role, so the filters render empty instead of erroring. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    const empty = { actions: [], people: [], workspaces: [] };

    const current = await getCurrentUser(ctx);
    const role = current?.user.role;
    if (!role || !GOVERNANCE_READ_ROLES.includes(role as (typeof GOVERNANCE_READ_ROLES)[number])) {
      return empty;
    }

    const platformWide = role === "SUPER_ADMIN" || role === "READ_ONLY";
    const companyId = getActiveCompanyId(current.user);
    if (!platformWide && !companyId) return empty;

    const recent = platformWide
      ? await ctx.db.query("auditLogs").withIndex("by_timestamp").order("desc").take(AUDIT_ACTION_SCAN_LIMIT)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .order("desc")
          .take(AUDIT_ACTION_SCAN_LIMIT);

    const actions = [...new Set(recent.map((log) => log.actionType))].sort();

    const people = (await ctx.db.query("users").take(500))
      .map((user) => ({ id: user._id, name: user.name || user.email || "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // A workspace administrator has exactly one, and offering a list of one is
    // a control that does nothing.
    const workspaces = platformWide
      ? (await ctx.db.query("companies").take(500))
          .map((company) => ({ id: company._id, name: company.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return { actions, people, workspaces };
  },
});

/**
 * The trail, as a file somebody can keep.
 *
 * The first thing anyone asks a governance product for is the evidence in a
 * form they can hand on, and there was no way to produce one. Same filters as
 * the screen, so what is exported is what the reader was looking at.
 *
 * Capped, and the cap is reported rather than swallowed. A truncated export
 * that looks complete is worse than no export — it is a document somebody would
 * sign their name to. The screen says plainly when the cap was reached and what
 * to narrow.
 */
export const AUDIT_EXPORT_LIMIT = 5000;

/**
 * A mutation, though it is plainly a read.
 *
 * Taking a copy of the whole trail off the platform is the one read on this
 * screen that is itself worth recording, and a Convex query cannot write. So
 * this writes: the export leaves its own entry, naming who took it and what
 * they narrowed it to.
 *
 * Viewing the trail is not recorded and is not meant to be. That is a page
 * view, and the decision at the top of the plan is that page views belong in a
 * web log — mixing them in makes both useless.
 */
export const getAuditExport = publicMutation({
  reason:
    "Returns an empty export rather than throwing when the caller lacks a session or an oversight role, so the screen shows nothing to download instead of an error. Role filtering happens inside the handler.",
  args: {
    actionType: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const empty = { rows: [], truncated: false };

    const current = await getCurrentUser(ctx);
    const role = current?.user.role;
    if (!role || !GOVERNANCE_READ_ROLES.includes(role as (typeof GOVERNANCE_READ_ROLES)[number])) {
      return empty;
    }

    const platformWide = role === "SUPER_ADMIN" || role === "READ_ONLY";
    const scopeCompanyId = getActiveCompanyId(current.user);
    if (!platformWide && !scopeCompanyId) return empty;

    const from = args.from ?? 0;
    const to = args.to ?? Number.MAX_SAFE_INTEGER;

    // One more than the cap, so the screen can tell the difference between a
    // full export and one that stopped early.
    const found = platformWide
      ? await ctx.db
          .query("auditLogs")
          .withIndex("by_timestamp", (q) => q.gte("timestamp", from).lte("timestamp", to))
          .order("desc")
          .take(AUDIT_EXPORT_LIMIT + 1)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_company", (q) =>
            q.eq("companyId", scopeCompanyId).gte("timestamp", from).lte("timestamp", to),
          )
          .order("desc")
          .take(AUDIT_EXPORT_LIMIT + 1);

    const truncated = found.length > AUDIT_EXPORT_LIMIT;
    const needle = (args.search ?? "").trim().toLowerCase();

    const described = await Promise.all(
      found.slice(0, AUDIT_EXPORT_LIMIT).map((log) => describeAuditRow(ctx, log)),
    );

    const rows = described
      .filter((log) => {
        if (args.actionType && log.actionType !== args.actionType) return false;
        if (args.actorId && log.actorId !== args.actorId) return false;
        if (args.companyId && log.companyId !== args.companyId) return false;
        if (!needle) return true;

        return [log.actionType, log.actorName ?? "", log.change, log.targetName ?? "", log.companyName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .map((log) => ({
        when: new Date(log.timestamp).toISOString(),
        action: log.actionType,
        who: log.actorName,
        whatHappened: log.change,
        target: log.targetName ?? log.entityId ?? "",
        workspace: log.companyName ?? "",
      }));

    // What was taken, and what it was narrowed to. An export that named only
    // the person would leave the next reader unable to tell whether they took
    // one workspace's week or the whole platform's year.
    await ctx.db.insert("auditLogs", {
      actionType: "EXPORT_AUDIT_TRAIL",
      actorId: current.userId,
      entityType: "auditLogs",
      entityId: "EXPORT",
      ...(args.companyId ? { companyId: args.companyId } : {}),
      timestamp: Date.now(),
      metadata: JSON.stringify({
        recordsTaken: rows.length,
        ...(truncated ? { stoppedAtTheLimit: "yes" } : {}),
        ...(args.from !== undefined ? { coveringFromAt: args.from } : {}),
        ...(args.actionType ? { narrowedToAction: args.actionType } : {}),
        ...(args.search ? { searchedFor: args.search } : {}),
      }),
    });

    return { rows, truncated };
  },
});

/**
 * One entry, fetched by its own id.
 *
 * The detail screen used to load the capped list of recent entries and search
 * it in the browser, so an entry older than the cap simply would not open —
 * the deep link existed and led nowhere. Read directly, any entry opens for as
 * long as it is retained.
 */
export const getAuditEntry = publicQuery({
  reason:
    "Returns null rather than throwing when the caller lacks a session or an oversight role, so the screen renders a not-found state instead of an error. Role filtering happens inside the handler.",
  args: { id: v.id("auditLogs") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const role = current?.user.role;
    if (!role || !GOVERNANCE_READ_ROLES.includes(role as (typeof GOVERNANCE_READ_ROLES)[number])) {
      return null;
    }

    const log = await ctx.db.get(args.id);
    if (!log) return null;

    // A workspace administrator may only open their own workspace's records.
    // Without this the deep link would be a way around the scoping the list
    // applies, which is the sort of hole an audit surface cannot have.
    const platformWide = role === "SUPER_ADMIN" || role === "READ_ONLY";
    if (!platformWide && log.companyId !== getActiveCompanyId(current.user)) return null;

    /*
     * The thing this happened to, by name.
     *
     * The screen showed `mh71mxwkegfxgxc6avhf9zyapd8btcbg` and expected a
     * person to know what that was — Anthony, 2026-08-06: *"the detail screen
     * is lacking in detail too."* An identifier is what the record stores; a
     * name is what a reader can act on. A record that has since been deleted
     * keeps its identifier, which is a fact worth showing rather than an
     * absence to paper over.
     */
    return {
      ...(await describeAuditRow(ctx, log)),
      changes: auditChangesFrom(log.metadata),
      // What the entry holds besides a before-and-after. Most entries are not
      // diffs, and the detail screen used to leave those readers with a folded
      // block of raw text as their only answer.
      details: auditDetailsFrom(log.metadata),
      change: describeAuditChange(log.metadata, log.actionType),
    };
  },
});
