import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { ADMIN_WRITE_ROLES } from "./authz";
import { companyHolds, findMySite, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { websiteIconUrl } from "./websiteIcons";
import {
  STATE_MAX_AGE_MS,
  accountOf,
  authorizeLink,
  googleAccessToken,
  isGoogleConfigured,
  newSignInState,
} from "./googleConnection";
import { lastThirtyDays, listKeyEvents, propertyDetails, runReport, siteAddresses, yesterdayUtc } from "./googleAnalyticsApi";
import { newestWholeDayIn } from "./googleAnalyticsCollect";
import {
  analyticsAttemptValidator,
  analyticsProblemValidator,
  analyticsStatusValidator,
  countedEventValidator,
  healthResultValidator,
  propertyChoiceValidator,
} from "./googleAnalyticsSchema";
import { tickedAtFirst } from "./utils/analyticsEvents";
import { startFirstCollection } from "./googleAnalyticsAgentRun";
import { tellAdmins } from "./googleAnalyticsHealth";

/**
 * Connecting an owned website to its Google Analytics
 * (docs/plans/active/google-analytics-plan.md §3).
 *
 * A company admin opens the website's Connection page in the Google Analytics
 * section and connects: Google's own sign-in, shared with Search Console
 * (`googleConnection.ts`), asks for Analytics and Search Console at once
 * (§10, Q3). On the way back, the account's properties are listed, the ones
 * with a web stream for this website first; one is chosen (§3, step 3 — one
 * match is shown for a yes, GA22), the website's own addresses are read and
 * the rest left out (§3, step 4, chosen for the client by §10, Q16), and the
 * property's key events are listed for the admin to tick what counts and what
 * each is worth (§3, step 5). Saving what counts connects it.
 *
 * Who (GA16): the company's admins and super admins connect, choose, tick and
 * disconnect; everyone in the company sees the figures. Hakken only ever reads
 * Google Analytics — it never changes a client's property (GA3).
 */

/** A value set in Hakken, in the property's currency: never below nothing, never absurd. */
const MOST_VALUE = 1_000_000;

async function connectionOfHold(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("googleAnalyticsConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

/** Whether this deployment has the Google app Analytics signs in with (Search Console's, §7, step 3). */
export function isGoogleAnalyticsConfigured(): boolean {
  return isGoogleConfigured();
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/**
 * Start connecting a website: its admins and super admins only, its own
 * websites only. Hands back the one link the browser follows; the state it
 * carries is the only thing that leaves the server.
 */
export const beginGoogleAnalyticsConnect = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) {
      throw appError("INVALID_INPUT", "Google Analytics is only for your company's own websites.");
    }
    if (!isGoogleAnalyticsConfigured()) {
      throw appError("NOT_CONFIGURED", "Google Analytics is not set up on this deployment yet.");
    }
    const now = Date.now();
    const state = newSignInState("GOOGLE_ANALYTICS", args.siteId, now);
    const existing = await connectionOfHold(ctx, args.siteId);
    // A connection that works keeps working until a new sign-in finishes.
    const pending = { pendingState: state, pendingAt: now, pendingBy: ctx.userId, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, pending);
    } else {
      await ctx.db.insert("googleAnalyticsConnections", {
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
      .query("googleAnalyticsConnections")
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

/** A sign-in that did not connect: over, and why, for the website's page. */
export const recordAttempt = internalMutation({
  args: { state: v.string(), outcome: analyticsAttemptValidator, account: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
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

const foundChoiceValidator = v.object({
  ...propertyChoiceValidator.fields,
  /** The addresses read, and the property's others, when they were read on the way back. */
  addresses: v.optional(v.array(v.string())),
  others: v.optional(v.array(v.string())),
});

/**
 * A sign-in that found the account's properties. Signing in again to mend a
 * connection keeps its property, its addresses and what counts, when the
 * property is still there; otherwise the admin chooses (§3, step 3). Without
 * `state`, Analytics takes up a sign-in started from Search Console while it
 * was waiting for one (`googleConnection.waitingForSignIn`).
 */
export const completeSignIn = internalMutation({
  args: {
    state: v.optional(v.string()),
    companyWebsiteId: v.id("companyWebsites"),
    googleConnectionId: v.id("googleConnections"),
    choices: v.array(foundChoiceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    let connection = args.state
      ? await ctx.db.query("googleAnalyticsConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first()
      : await connectionOfHold(ctx, args.companyWebsiteId);
    if (args.state && !connection) throw appError("CONFLICT", "This sign-in has already been used.");
    if (!connection) {
      const hold = await ctx.db.get(args.companyWebsiteId);
      if (!hold) return null;
      const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
        companyId: hold.companyId,
        companyWebsiteId: hold._id,
        websiteId: hold.websiteId,
        status: "CONNECTING",
        createdAt: now,
        updatedAt: now,
      });
      connection = (await ctx.db.get(connectionId))!;
    }
    const mending = connection.status === "NEEDS_RECONNECT" && connection.property !== undefined
      && args.choices.some((choice) => choice.property === connection.property);
    // The addresses read on the way back stay with the choice they belong to, for the screen's line (§3, step 4).
    const read = args.choices.flatMap((choice) => choice.addresses
      ? [{ property: choice.property, addresses: choice.addresses, others: choice.others ?? [] }]
      : []);
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      googleConnectionId: args.googleConnectionId,
      attempt: undefined,
      ...(mending
        ? { status: "CONNECTED" as const, choices: undefined, addressesFound: undefined, problem: undefined, problemAt: undefined }
        : {
          status: "CHOOSING" as const,
          choices: args.choices.map(({ addresses: _addresses, others: _others, ...choice }) => choice),
          addressesFound: read.length > 0 ? read : undefined,
        }),
      updatedAt: now,
    });
    return null;
  },
});

/**
 * The admin's choice of property (§3, step 3). Its addresses and key events
 * are then read from Google (`readWhatCounts`) for the admin to tick what
 * counts; another property than the one the figures came from clears them —
 * two properties' figures are never mixed.
 */
export const chooseGoogleAnalyticsProperty = adminMutation({
  args: { siteId: v.id("companyWebsites"), property: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || connection.status !== "CHOOSING") {
      throw appError("CONFLICT", "There is no property to choose: connect again.");
    }
    const choice = connection.choices?.find((entry) => entry.property === args.property);
    if (!choice) throw appError("NOT_FOUND", "That property is not one this account can see.");
    const found = connection.addressesFound?.find((entry) => entry.property === choice.property);
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "COUNTING",
      property: choice.property,
      propertyName: choice.displayName,
      stream: choice.stream ?? undefined,
      addresses: found?.addresses,
      otherAddresses: found?.others,
      // Another property's key events are not this one's: read afresh.
      events: connection.property === choice.property ? connection.events : undefined,
      choices: undefined,
      addressesFound: undefined,
      pendingBy: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsConnect.readWhatCounts, { connectionId: connection._id });
    return null;
  },
});

/** The admin wants to change what counts on a connected website: the key events read again, the figures kept. */
export const changeWhatCounts = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || (connection.status !== "CONNECTED" && connection.status !== "COUNTING")) {
      throw appError("CONFLICT", "Connect Google Analytics first.");
    }
    await ctx.db.patch(connection._id, { eventsReadAt: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsConnect.readWhatCounts, { connectionId: connection._id });
    return null;
  },
});

/** What reading what counts needs: the property, the website, and the shared sign-in. */
export const countingTarget = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.property) return null;
    const website = await ctx.db.get(connection.websiteId);
    if (!website) return null;
    return {
      property: connection.property,
      host: website.host,
      addresses: connection.addresses ?? null,
      googleConnectionId: connection.googleConnectionId ?? null,
    };
  },
});

/**
 * Read from Google what the admin chooses from (§3, steps 4 and 5): the
 * property's name, time zone and currency, the website's own addresses when
 * they are not known yet, and the property's key events with how many of each
 * the website had in the last 30 days and the value Analytics gives each.
 */
export const readWhatCounts = internalAction({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.googleAnalyticsConnect.countingTarget, args);
    if (!target) return null;
    const token = await accessTokenFor(ctx, args.connectionId);
    if (!token.ok) return null;
    const details = await propertyDetails(token.accessToken, target.property);
    // The property's own time zone is known from here on; until then, yesterday in UTC.
    const newest = details.ok ? newestWholeDayIn(Date.now(), details.details.timeZone) : yesterdayUtc(Date.now());
    const addresses = target.addresses
      ? { ok: true as const, found: { addresses: target.addresses, others: null } }
      : await siteAddresses(token.accessToken, target.property, target.host, newest);
    const keyEvents = await listKeyEvents(token.accessToken, target.property);
    if (!details.ok || !addresses.ok || !keyEvents.ok) {
      const refused = [details, addresses, keyEvents].find((answer) => !answer.ok);
      await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, {
        connectionId: args.connectionId,
        problem: refused && !refused.ok && refused.reason === "ACCESS" ? "NO_ACCESS" : "GOOGLE_BUSY",
      });
      return null;
    }
    const names = keyEvents.events.map((event) => event.eventName);
    const counts = new Map<string, { count: number; value: number }>();
    if (names.length > 0) {
      const report = await runReport(token.accessToken, target.property, {
        startDate: lastThirtyDays(newest).from,
        endDate: newest,
        dimensions: ["eventName"],
        metrics: ["eventCount", "eventValue"],
        hostNames: addresses.found.addresses,
        eventNames: names,
      });
      if (report.ok) {
        for (const row of report.rows) counts.set(row.keys[0], { count: row.values[0], value: row.values[1] });
      }
    }
    await ctx.runMutation(internal.googleAnalyticsConnect.writeWhatCounts, {
      connectionId: args.connectionId,
      property: target.property,
      propertyName: details.details.displayName,
      timeZone: details.details.timeZone,
      currency: details.details.currencyCode,
      addresses: addresses.found.addresses,
      ...(addresses.found.others ? { otherAddresses: addresses.found.others } : {}),
      events: keyEvents.events.map((event) => {
        const seen = counts.get(event.eventName);
        // Analytics' own value: the event's default, or the average of the values sent with it.
        const sent = seen && seen.count > 0 && seen.value > 0 ? Math.round((seen.value / seen.count) * 100) / 100 : null;
        return { eventName: event.eventName, analyticsValue: event.defaultValue ?? sent, lastThirtyDays: seen?.count ?? 0 };
      }),
    });
    return null;
  },
});

/**
 * What was read, kept for the admin's choice. An event already ticked keeps
 * its tick and its Hakken value; a new one is ticked only when it is nearly
 * always a conversion (`tickedAtFirst`).
 */
export const writeWhatCounts = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    propertyName: v.string(),
    timeZone: v.string(),
    currency: v.string(),
    addresses: v.array(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    events: v.array(v.object({ eventName: v.string(), analyticsValue: v.union(v.number(), v.null()), lastThirtyDays: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Another property chosen meanwhile: this reading is not its.
    if (!connection || connection.property !== args.property) return null;
    const before = new Map((connection.events ?? []).map((event) => [event.eventName, event]));
    const firstTime = connection.events === undefined;
    await ctx.db.patch(connection._id, {
      propertyName: args.propertyName,
      timeZone: args.timeZone,
      currency: args.currency,
      addresses: args.addresses,
      ...(args.otherAddresses ? { otherAddresses: args.otherAddresses } : {}),
      events: args.events.map((event) => {
        const held = before.get(event.eventName);
        return {
          eventName: event.eventName,
          counted: held ? held.counted : firstTime && tickedAtFirst(event.eventName),
          analyticsValue: event.analyticsValue,
          hakkenValue: held?.hakkenValue ?? null,
          lastThirtyDays: event.lastThirtyDays,
        };
      }),
      eventsReadAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Save what counts and what each is worth (§3, step 5; GA5, GA6). The first
 * save connects the website and starts collecting at once (§10, Q15). A value
 * set in Hakken is applied when the figures are read (§4.3), so a change
 * re-prices all history without rewriting it.
 */
export const saveWhatCounts = adminMutation({
  args: {
    siteId: v.id("companyWebsites"),
    events: v.array(v.object({ eventName: v.string(), counted: v.boolean(), hakkenValue: v.union(v.number(), v.null()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || (connection.status !== "COUNTING" && connection.status !== "CONNECTED") || !connection.events) {
      throw appError("CONFLICT", "Choose the property first.");
    }
    const chosen = new Map(args.events.map((event) => [event.eventName, event]));
    for (const event of args.events) {
      if (!connection.events.some((held) => held.eventName === event.eventName)) {
        throw appError("NOT_FOUND", `${event.eventName} is not a key event of this property.`);
      }
      if (event.hakkenValue !== null && (!Number.isFinite(event.hakkenValue) || event.hakkenValue < 0 || event.hakkenValue > MOST_VALUE)) {
        throw appError("INVALID_INPUT", `A value must be between 0 and ${MOST_VALUE.toLocaleString("en-GB")}.`);
      }
    }
    const now = Date.now();
    const first = connection.status === "COUNTING";
    const another = first && connection.dataProperty !== undefined && connection.dataProperty !== connection.property;
    await ctx.db.patch(connection._id, {
      events: connection.events.map((held) => {
        const event = chosen.get(held.eventName);
        return event ? { ...held, counted: event.counted, hakkenValue: event.hakkenValue } : held;
      }),
      ...(first
        ? {
          status: "CONNECTED" as const,
          dataProperty: connection.property,
          connectedBy: ctx.userId,
          connectedAt: now,
          disconnectedAt: undefined,
          problem: undefined,
          problemAt: undefined,
          ...(another ? { clearing: true, newestDay: undefined, oldestDay: undefined, backfilledAt: undefined } : {}),
        }
        : {}),
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: first ? "GOOGLE_ANALYTICS_CONNECTED" : "GOOGLE_ANALYTICS_COUNTED_CHANGED",
      entityId: connection._id.toString(),
      entityType: "googleAnalyticsConnections",
      companyId: connection.companyId,
      timestamp: now,
      // The account, the property and what counts, never a token.
      metadata: JSON.stringify({
        account: await accountOf(ctx, connection.googleConnectionId),
        property: connection.property,
        counted: args.events.filter((event) => event.counted).map((event) => event.eventName),
      }),
    });
    // Another property's figures go first; collecting starts at once, for this website alone (§10, Q15).
    if (another) await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.clearFigures, { companyWebsiteId: connection.companyWebsiteId });
    else if (first) await startFirstCollection(ctx, (await ctx.db.get(connection._id))!);
    if (first) {
      const website = await ctx.db.get(connection.websiteId);
      const host = website?.displayHost ?? website?.host ?? "";
      await tellAdmins(ctx, connection, `${host} is connected to Google Analytics`, "Its last 90 days are coming in now, newest week first.", `/app/analytics/${connection.companyWebsiteId}`, "GOOGLE_ANALYTICS_CONNECTED");
    } else if (connection.newestDay) {
      // What counts changed: the checks that read it say so at once.
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsHealth.runHealthChecks, { connectionId: connection._id });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Disconnecting
// ---------------------------------------------------------------------------

/**
 * Stop collecting: what was collected stays, marked with the day it was
 * disconnected. Search Console stays connected (§3); the Google sign-in is
 * given back only when Search Console does not read with it.
 */
export const disconnectGoogleAnalytics = adminMutation({
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
      addressesFound: undefined,
      problem: undefined,
      problemAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "GOOGLE_ANALYTICS_DISCONNECTED",
      entityId: connection._id.toString(),
      entityType: "googleAnalyticsConnections",
      companyId: connection.companyId,
      timestamp: now,
      metadata: JSON.stringify({ account: await accountOf(ctx, connection.googleConnectionId), property: connection.property }),
    });
    await ctx.scheduler.runAfter(0, internal.googleConnection.releaseUnused, { companyWebsiteId: connection.companyWebsiteId });
    return null;
  },
});

/**
 * A website the company no longer holds: its Analytics connection and
 * everything it brought, a batch at a time (`googleAnalyticsCollect.purgeFigures`).
 * Its Google sign-in has already been given back (`googleConnection.forgetHold`).
 */
export const purgeHold = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await connectionOfHold(ctx, args.companyWebsiteId);
    // Stop anything still collecting before the figures go.
    if (connection && connection.status !== "DISCONNECTED") {
      await ctx.db.patch(connection._id, { status: "DISCONNECTED", disconnectedAt: Date.now() });
    }
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.purgeFigures, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// A usable access token
// ---------------------------------------------------------------------------

/**
 * Something stopped the connection or its collection. Google taking the
 * access back, the account losing the property, or keys that cannot be read
 * need the admin to connect again; the rest leave the connection as it is and
 * say so until a collection goes right.
 */
export const noteProblem = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), problem: analyticsProblemValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const now = Date.now();
    const reconnect = args.problem === "REVOKED" || args.problem === "NO_ACCESS" || args.problem === "UNREADABLE";
    const working = connection.status === "CONNECTED" || connection.status === "COUNTING";
    await ctx.db.patch(connection._id, {
      problem: args.problem,
      problemAt: now,
      ...(reconnect && working ? { status: "NEEDS_RECONNECT" as const } : {}),
      updatedAt: now,
    });
    return null;
  },
});

export const googleConnectionOf = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.union(v.id("googleConnections"), v.null()),
  handler: async (ctx, args) => (await ctx.db.get(args.connectionId))?.googleConnectionId ?? null,
});

/** The one door to a usable access token for Analytics: the website's shared Google sign-in. */
export async function accessTokenFor(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
  renew = false,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: "NOT_CONFIGURED" | "REVOKED" | "UNREADABLE" | "GOOGLE_BUSY" }> {
  const googleConnectionId = await ctx.runQuery(internal.googleAnalyticsConnect.googleConnectionOf, { connectionId });
  const token = await googleAccessToken(ctx, googleConnectionId, renew);
  if (token.ok) return token;
  await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId, problem: token.problem });
  return token;
}

// ---------------------------------------------------------------------------
// What the website's pages read
// ---------------------------------------------------------------------------

const orNull = <T extends ReturnType<typeof v.string>>(validator: T) => v.union(validator, v.null());

/** Whether the Search Console connection reads with the same Google sign-in: the Connection page says so. */
async function searchConsoleOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

export const statusConnectionValidator = v.object({
  status: analyticsStatusValidator,
  signingIn: v.boolean(),
  googleAccount: orNull(v.string()),
  /** Search Console reads with the same Google sign-in. */
  sharedWithSearchConsole: v.boolean(),
  choices: v.array(v.object({
    ...propertyChoiceValidator.fields,
    addresses: v.array(v.string()),
    others: v.array(v.string()),
  })),
  property: orNull(v.string()),
  propertyName: orNull(v.string()),
  stream: orNull(v.string()),
  addresses: v.array(v.string()),
  otherAddresses: v.array(v.string()),
  timeZone: orNull(v.string()),
  currency: orNull(v.string()),
  /** Null while the key events are read from Google. */
  events: v.union(v.array(countedEventValidator), v.null()),
  connectedAt: v.union(v.number(), v.null()),
  disconnectedAt: v.union(v.number(), v.null()),
  newestDay: orNull(v.string()),
  oldestDay: orNull(v.string()),
  historyDone: v.boolean(),
  clearing: v.boolean(),
  lastCollectedAt: v.union(v.number(), v.null()),
  collecting: v.union(v.null(), v.object({ from: v.string(), top: v.string() })),
  problem: v.union(analyticsProblemValidator, v.null()),
  attempt: v.union(v.null(), v.object({ outcome: analyticsAttemptValidator, account: orNull(v.string()), at: v.number() })),
  /** The tracking health checks' last results (§6). */
  health: v.union(v.null(), v.object({ checkedAt: v.number(), checks: v.array(healthResultValidator) })),
});

/**
 * The website's Google Analytics connection, as its pages show it: never a
 * token, never the sign-in's state. Anyone in the company sees it;
 * `canManage` says whether this reader may connect, choose, tick and
 * disconnect. Null for a website that is not one of the caller's company's.
 */
export const googleAnalyticsStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    configured: v.boolean(),
    owned: v.boolean(),
    canManage: v.boolean(),
    host: v.string(),
    iconUrl: v.union(v.string(), v.null()),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    /** Search Console is connected: the first screen offers to add Analytics to that sign-in (§3, screen 1). */
    searchConsoleConnected: v.boolean(),
    connection: v.union(v.null(), statusConnectionValidator),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const connection = await connectionOfHold(ctx, site.hold._id);
    const consoleConnection = await searchConsoleOf(ctx, site.hold._id);
    const holds = await companyHolds(ctx, site.hold.companyId);
    return {
      configured: isGoogleAnalyticsConfigured(),
      owned: !isTrackedHold(site.hold),
      canManage: (ADMIN_WRITE_ROLES as readonly string[]).includes(ctx.user.role ?? ""),
      host: site.website.displayHost,
      iconUrl: await websiteIconUrl(ctx, site.website._id),
      ownSites: holds
        .filter((entry) => entry.summary.relationship === "OWNED")
        .map((entry) => ({ siteId: entry.summary.siteId, host: entry.summary.host })),
      searchConsoleConnected: consoleConnection?.status === "CONNECTED",
      connection: connection ? await asStatus(ctx, connection, consoleConnection) : null,
    };
  },
});

async function asStatus(
  ctx: { db: QueryCtx["db"] },
  connection: Doc<"googleAnalyticsConnections">,
  consoleConnection: Doc<"searchConsoleConnections"> | null,
) {
  const now = Date.now();
  const found = new Map((connection.addressesFound ?? []).map((entry) => [entry.property, entry]));
  return {
    status: connection.status,
    signingIn: Boolean(connection.pendingAt && now - connection.pendingAt <= STATE_MAX_AGE_MS),
    googleAccount: await accountOf(ctx, connection.googleConnectionId),
    sharedWithSearchConsole: consoleConnection !== null && connection.googleConnectionId !== undefined
      && consoleConnection.googleConnectionId === connection.googleConnectionId && consoleConnection.status !== "DISCONNECTED",
    choices: connection.status === "CHOOSING"
      ? (connection.choices ?? []).map((choice) => ({
        ...choice,
        addresses: found.get(choice.property)?.addresses ?? [],
        others: found.get(choice.property)?.others ?? [],
      }))
      : [],
    property: connection.property ?? null,
    propertyName: connection.propertyName ?? null,
    stream: connection.stream ?? null,
    addresses: connection.addresses ?? [],
    otherAddresses: connection.otherAddresses ?? [],
    timeZone: connection.timeZone ?? null,
    currency: connection.currency ?? null,
    events: connection.eventsReadAt !== undefined ? connection.events ?? [] : null,
    connectedAt: connection.connectedAt ?? null,
    disconnectedAt: connection.disconnectedAt ?? null,
    newestDay: connection.newestDay ?? null,
    oldestDay: connection.oldestDay ?? null,
    historyDone: connection.backfilledAt !== undefined,
    clearing: connection.clearing === true,
    lastCollectedAt: connection.lastCollectedAt ?? null,
    collecting: connection.collecting ? { from: connection.collecting.from, top: connection.collecting.top } : null,
    problem: connection.problem ?? null,
    attempt: connection.attempt
      ? { outcome: connection.attempt.outcome, account: connection.attempt.account ?? null, at: connection.attempt.at }
      : null,
    health: connection.health ?? null,
  };
}
