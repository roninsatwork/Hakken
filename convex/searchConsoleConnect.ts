import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { ADMIN_WRITE_ROLES } from "./authz";
import { companyHolds, findMySite, requireMySite } from "./siteAccess";
import { noteHoldPagesChanged } from "./holdPages";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { websiteIconUrl } from "./websiteIcons";
import { consoleLimitsOf, consoleLimitsValidator } from "./searchConsoleLimits";
import {
  STATE_MAX_AGE_MS,
  accountOf,
  authorizeLink,
  googleAccessToken,
  isGoogleConfigured,
  newSignInState,
} from "./googleConnection";
import {
  attemptOutcomeValidator,
  connectionProblemValidator,
  connectionStatusValidator,
  searchTypeValidator,
} from "./searchConsoleSchema";
import { historyLimitDay } from "./searchConsoleDays";
import { kindsHeld } from "./searchConsoleRollups";

/**
 * Connecting an owned website to its Google Search Console
 * (docs/plans/active/search-console-plan.md §3).
 *
 * A company admin opens the website in the Search Console section and connects
 * (`beginSearchConsoleConnect` stores a single-use random state on the site's
 * connection) and signs in at Google through the one Google sign-in Search
 * Console shares with Google Analytics (`googleConnection.ts`,
 * google-analytics-plan.md §4.6). On the way back, the account's properties
 * that are this website are found, the tokens are kept once for the website
 * (`googleConnections`, `googleTokens`), and this connection names them. One
 * property that is the whole site is chosen at once; several wait on the
 * site's page for the admin to choose.
 */

export type ConnectionProblem = Infer<typeof connectionProblemValidator>;
const propertyValidator = v.object({ property: v.string(), permission: v.string() });

/** Whether this deployment has the Google app Search Console signs in with, and the key tokens are kept under. */
export function isSearchConsoleConfigured(): boolean {
  return isGoogleConfigured();
}

async function connectionOfHold(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/**
 * Start connecting a site: its admins and super admins only (SC4), its own
 * websites only (SC8). Hands back the one link the browser follows; the state
 * it carries is the only thing that leaves the server.
 */
export const beginSearchConsoleConnect = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) {
      throw appError("INVALID_INPUT", "Search Console is only for your company's own websites.");
    }
    if (!isSearchConsoleConfigured()) {
      throw appError("NOT_CONFIGURED", "Search Console is not set up on this deployment yet.");
    }
    const now = Date.now();
    const state = newSignInState("SEARCH_CONSOLE", args.siteId, now);
    const existing = await connectionOfHold(ctx, args.siteId);
    // A connection that works keeps working until a new sign-in finishes.
    const pending = { pendingState: state, pendingAt: now, pendingBy: ctx.userId, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, pending);
    } else {
      await ctx.db.insert("searchConsoleConnections", {
        companyId: site.hold.companyId,
        companyWebsiteId: args.siteId,
        websiteId: site.website._id,
        status: "CONNECTING",
        ...pending,
        createdAt: now,
      });
    }
    return { authorizeUrl: authorizeLink(state) };
  },
});

/** A sign-in under way, when its state is one this deployment minted in the last fifteen minutes. */
export const pendingByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    if (!args.state) return null;
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection?.pendingAt || Date.now() - connection.pendingAt > STATE_MAX_AGE_MS) return null;
    const website = await ctx.db.get(connection.websiteId);
    if (!website) return null;
    return { connectionId: connection._id, companyWebsiteId: connection.companyWebsiteId, host: website.host };
  },
});

// ---------------------------------------------------------------------------
// Coming back (`googleConnection.handleGoogleCallback`)
// ---------------------------------------------------------------------------

/** A sign-in that did not connect: over, and why, for the site's page. */
export const recordAttempt = internalMutation({
  args: {
    state: v.string(),
    outcome: attemptOutcomeValidator,
    account: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      attempt: { outcome: args.outcome, account: args.account, at: now },
      updatedAt: now,
    });
    return null;
  },
});

/**
 * A sign-in that found the site: the connection names the website's Google
 * connection, and its property is chosen — the one it had before when it is
 * still there, or the only one that is the whole site — or left for the admin
 * to choose from the rest. With `state`, the sign-in started here; without,
 * Search Console takes up a sign-in started from Google Analytics while it
 * was waiting for one (`googleConnection.waitingForSignIn`; google-analytics-
 * plan.md §10, Q3), and a website with no connection yet gets one.
 */
export const completeSignIn = internalMutation({
  args: {
    state: v.optional(v.string()),
    companyWebsiteId: v.id("companyWebsites"),
    googleConnectionId: v.id("googleConnections"),
    choices: v.array(propertyValidator),
    only: v.union(propertyValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    let connection = args.state
      ? await ctx.db.query("searchConsoleConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first()
      : await connectionOfHold(ctx, args.companyWebsiteId);
    if (args.state && !connection) throw appError("CONFLICT", "This sign-in has already been used.");
    if (!connection) {
      const hold = await ctx.db.get(args.companyWebsiteId);
      if (!hold) return null;
      const connectionId = await ctx.db.insert("searchConsoleConnections", {
        companyId: hold.companyId,
        companyWebsiteId: hold._id,
        websiteId: hold.websiteId,
        status: "CONNECTING",
        createdAt: now,
        updatedAt: now,
      });
      connection = (await ctx.db.get(connectionId))!;
    }
    const startedBy = args.state ? connection.pendingBy : undefined;
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      googleConnectionId: args.googleConnectionId,
      attempt: undefined,
      updatedAt: now,
    });

    // Signing in again to mend a connection keeps its property; after a disconnect, the admin chooses again.
    const kept = connection.status !== "DISCONNECTED" && connection.property
      ? args.choices.find((choice) => choice.property === connection.property)
      : undefined;
    const pick = kept ?? args.only;
    if (pick) {
      await connectTo(ctx, connection._id, pick, startedBy);
    } else {
      await ctx.db.patch(connection._id, { status: "CHOOSING", choices: args.choices, pendingBy: undefined });
    }
    return null;
  },
});

/**
 * Connected to a property. Collecting does not start here: it waits for the
 * Search Console agent and its schedule (search-console-plan.md §12). Another
 * property than the one the figures held came from clears them — two
 * properties' figures are never mixed.
 */
async function connectTo(
  ctx: MutationCtx,
  connectionId: Id<"searchConsoleConnections">,
  choice: { property: string; permission: string },
  actorId: Id<"users"> | undefined,
) {
  const connection = (await ctx.db.get(connectionId))!;
  const now = Date.now();
  const another = connection.dataProperty !== undefined && connection.dataProperty !== choice.property;
  await ctx.db.patch(connection._id, {
    status: "CONNECTED",
    property: choice.property,
    permission: choice.permission,
    dataProperty: choice.property,
    choices: undefined,
    pendingBy: undefined,
    connectedBy: actorId,
    connectedAt: now,
    disconnectedAt: undefined,
    problem: undefined,
    problemAt: undefined,
    ...(another
      ? { clearing: true, newestDay: undefined, oldestDay: undefined, countriesHeld: undefined, backfilledAt: undefined, historyAt: undefined }
      : {}),
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId,
    actionType: "SEARCH_CONSOLE_CONNECTED",
    entityId: connection._id.toString(),
    entityType: "searchConsoleConnections",
    companyId: connection.companyId,
    timestamp: now,
    // The account and property, never a token.
    metadata: JSON.stringify({ account: await accountOf(ctx, connection.googleConnectionId), property: choice.property }),
  });
  if (another) {
    await ctx.scheduler.runAfter(0, internal.searchConsoleSync.clearFigures, {
      companyWebsiteId: connection.companyWebsiteId,
    });
    // The last property's clicks go from Your pages that night (dataforseo-cost-plan.md, A1).
    await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
  }
}

/** The admin's choice among the account's properties that are this website. */
export const chooseSearchConsoleProperty = adminMutation({
  args: { siteId: v.id("companyWebsites"), property: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || connection.status !== "CHOOSING") {
      throw appError("CONFLICT", "There is no property to choose: connect again.");
    }
    const choice = connection.choices?.find((entry) => entry.property === args.property);
    if (!choice) throw appError("NOT_FOUND", "That property is not one this account can read for this website.");
    await connectTo(ctx, connection._id, choice, ctx.userId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Disconnecting
// ---------------------------------------------------------------------------

/**
 * Stop collecting and give Google's access back (SC7): what was collected
 * stays, marked with the day it was disconnected.
 */
export const disconnectSearchConsole = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || connection.status === "DISCONNECTED") return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "DISCONNECTED",
      disconnectedAt: now,
      googleConnectionId: undefined,
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      choices: undefined,
      problem: undefined,
      problemAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SEARCH_CONSOLE_DISCONNECTED",
      entityId: connection._id.toString(),
      entityType: "searchConsoleConnections",
      companyId: connection.companyId,
      timestamp: now,
      metadata: JSON.stringify({ account: await accountOf(ctx, connection.googleConnectionId), property: connection.property }),
    });
    // The Google sign-in is given back unless Google Analytics still reads with it (`googleConnection.ts`).
    await ctx.scheduler.runAfter(0, internal.googleConnection.releaseUnused, { companyWebsiteId: connection.companyWebsiteId });
    // Your pages shows Search Console's clicks only while connected: rebuilt that night (dataforseo-cost-plan.md, A1).
    await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// A usable access token
// ---------------------------------------------------------------------------

/**
 * Something stopped the connection or its collection. Google taking the
 * access back, the account losing the property, or keys that cannot be read
 * need the admin to connect again; the rest (Google busy, the deployment's
 * settings, a site no longer the company's own) leave the connection as it is
 * and say so until a collection goes right.
 */
export const noteProblem = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), problem: connectionProblemValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const now = Date.now();
    const reconnect = args.problem === "REVOKED" || args.problem === "NO_ACCESS" || args.problem === "UNREADABLE";
    await ctx.db.patch(connection._id, {
      problem: args.problem,
      problemAt: now,
      ...(reconnect && connection.status === "CONNECTED" ? { status: "NEEDS_RECONNECT" as const } : {}),
      updatedAt: now,
    });
    // No longer connected: Your pages drops its clicks that night (dataforseo-cost-plan.md, A1).
    // Keys Google refused, or that cannot be read, were dropped by `googleAccessToken`.
    if (reconnect && connection.status === "CONNECTED") await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
    return null;
  },
});

/** The Google sign-in a connection reads with. */
export const googleConnectionOf = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.union(v.id("googleConnections"), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.connectionId))?.googleConnectionId ?? null,
});

/**
 * The one door to a usable access token, for the collection: the website's
 * shared Google sign-in (`googleConnection.googleAccessToken`), renewed when
 * near its end or just refused (`renew`). When it cannot go on, the
 * connection says so.
 */
export async function accessTokenFor(
  ctx: ActionCtx,
  connectionId: Id<"searchConsoleConnections">,
  renew = false,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: ConnectionProblem }> {
  const googleConnectionId = await ctx.runQuery(internal.searchConsoleConnect.googleConnectionOf, { connectionId });
  const token = await googleAccessToken(ctx, googleConnectionId, renew);
  if (token.ok) return token;
  await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId, problem: token.problem });
  return token;
}

// ---------------------------------------------------------------------------
// What the site's page reads
// ---------------------------------------------------------------------------

const orNull = <T extends ReturnType<typeof v.string>>(validator: T) => v.union(validator, v.null());

/**
 * The site's Search Console connection, as its page shows it: never a token,
 * never the sign-in's state. Anyone in the company sees it; `canManage` says
 * whether this reader may connect, choose and disconnect (SC4). Null for a
 * website that is not one of the caller's company's — the same answer as a
 * missing one, as the Sites header gives.
 */
export const searchConsoleStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    configured: v.boolean(),
    owned: v.boolean(),
    canManage: v.boolean(),
    /** The website, as a person reads it, and the company's other own websites, for the switcher. */
    host: v.string(),
    /** The website's own icon, as Sites draws it; null to draw its letter. */
    iconUrl: v.union(v.string(), v.null()),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    /** The oldest day Google still keeps: how far back the history goes. */
    historyFrom: v.string(),
    /** The website's Search Console limits: what its pages read and the rules they say (§17). */
    limits: consoleLimitsValidator,
    /**
     * The kinds of result Google has figures for, for the website's main home
     * country: web, and video, news, Discover or Google News only where it
     * has them — the tabs its pages show (search-console-home-countries-plan.md).
     */
    kinds: v.array(searchTypeValidator),
    connection: v.union(
      v.null(),
      v.object({
        status: connectionStatusValidator,
        signingIn: v.boolean(),
        googleAccount: orNull(v.string()),
        property: orNull(v.string()),
        permission: orNull(v.string()),
        choices: v.array(propertyValidator),
        connectedAt: v.union(v.number(), v.null()),
        disconnectedAt: v.union(v.number(), v.null()),
        newestDay: orNull(v.string()),
        oldestDay: orNull(v.string()),
        /** Each country kept ready and collected, with its own newest day: its quick picks end there (§16). */
        countriesNewest: v.array(v.object({ country: v.string(), newestDay: v.string() })),
        historyDone: v.boolean(),
        clearing: v.boolean(),
        lastCollectedAt: v.union(v.number(), v.null()),
        problem: v.union(connectionProblemValidator, v.null()),
        attempt: v.union(
          v.null(),
          v.object({ outcome: attemptOutcomeValidator, account: orNull(v.string()), at: v.number() }),
        ),
      }),
    ),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const connection = await connectionOfHold(ctx, site.hold._id);
    const holds = await companyHolds(ctx, site.hold.companyId);
    const now = Date.now();
    return {
      configured: isSearchConsoleConfigured(),
      owned: !isTrackedHold(site.hold),
      canManage: (ADMIN_WRITE_ROLES as readonly string[]).includes(ctx.user.role ?? ""),
      host: site.website.displayHost,
      iconUrl: await websiteIconUrl(ctx, site.website._id),
      ownSites: holds
        .filter((entry) => entry.summary.relationship === "OWNED")
        .map((entry) => ({ siteId: entry.summary.siteId, host: entry.summary.host })),
      historyFrom: historyLimitDay(now),
      limits: await consoleLimitsOf(ctx, site.hold),
      kinds: connection ? await kindsHeld(ctx, site.hold._id) : [],
      connection: connection
        ? {
          status: connection.status,
          signingIn: Boolean(connection.pendingAt && now - connection.pendingAt <= STATE_MAX_AGE_MS),
          googleAccount: await accountOf(ctx, connection.googleConnectionId),
          property: connection.property ?? null,
          permission: connection.permission ?? null,
          choices: connection.status === "CHOOSING" ? connection.choices ?? [] : [],
          connectedAt: connection.connectedAt ?? null,
          disconnectedAt: connection.disconnectedAt ?? null,
          newestDay: connection.newestDay ?? null,
          oldestDay: connection.oldestDay ?? null,
          countriesNewest: (connection.countriesHeld ?? []).map((held) => ({ country: held.country, newestDay: held.newestDay })),
          historyDone: connection.backfilledAt !== undefined,
          clearing: connection.clearing === true,
          lastCollectedAt: connection.lastCollectedAt ?? null,
          problem: connection.problem ?? null,
          attempt: connection.attempt
            ? { outcome: connection.attempt.outcome, account: connection.attempt.account ?? null, at: connection.attempt.at }
            : null,
        }
        : null,
    };
  },
});
