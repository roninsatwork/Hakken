import { v } from "convex/values";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { ADMIN_WRITE_ROLES } from "./authz";
import { companyHolds, findMySite, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { websiteIconUrl } from "./websiteIcons";
import { noteHoldPagesChanged } from "./holdPages";
import {
  STATE_MAX_AGE_MS,
  accountOf,
  authorizeLink,
  googleAccessToken,
  isGoogleConfigured,
  newSignInState,
} from "./googleConnection";
import { listKeyEvents, propertyDetails, siteAddresses, yesterdayUtc } from "./googleAnalyticsApi";
import { countryIdOf, newestWholeDayIn } from "./googleAnalyticsCollect";
import {
  LISTED_WITH,
  analyticsAttemptValidator,
  analyticsProblemValidator,
  analyticsStatusValidator,
  countedEventValidator,
  healthResultValidator,
  heldAddressValidator,
  propertyChoiceValidator,
} from "./googleAnalyticsSchema";
import { tickedAtFirst } from "./utils/analyticsEvents";
import { conversionAddressesOf, countsConversions, hakkenCounts } from "./utils/analyticsAddresses";
import { readEventsByAddress } from "./googleAnalyticsAddressReads";
import { forgetCountedHistory } from "./insightHistoryForget";
import { startFirstCollection } from "./googleAnalyticsAgentRun";
import { tellSuperAdmins } from "./googleAnalyticsHealth";
import { shiftDay } from "./searchConsoleDays";

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
        ? { status: "CONNECTED" as const, choices: undefined, addressesFound: undefined, problem: undefined, problemAt: undefined, problemDetail: undefined }
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
    // Another property than the figures came from: their visits leave the website's page list that night (dataforseo-cost-plan.md, A1).
    if (connection.dataProperty !== undefined && connection.dataProperty !== choice.property) await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
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
    const hold = await ctx.db.get(connection.companyWebsiteId);
    return {
      property: connection.property,
      // Its events still to be read (BR1): chosen and not read yet, or listed before Hakken listed as it does now.
      waiting: (connection.status === "COUNTING" || connection.status === "CONNECTED")
        && (connection.eventsReadAt === undefined || connection.listedWith !== LISTED_WITH),
      host: website.host,
      addresses: connection.addresses ?? null,
      // The other addresses as last read: an admin's tick on one stays (conversion-addresses-plan.md).
      held: connection.addressesRead ?? [],
      googleConnectionId: connection.googleConnectionId ?? null,
      // Counted in the main home country, as every figure is (google-analytics-plan.md §18.6.1).
      country: countryIdOf(hold ? mainConsoleCountry(hold) : "gbr"),
    };
  },
});

export { MOST_ENQUIRY_EVENTS } from "./googleAnalyticsAddressReads";

/**
 * When reading a property's events fails, Hakken asks again by itself
 * (ga-big-site-reliability-plan.md BR1): after 5 minutes, 30, 2 hours, then
 * every 6 hours until it reads — nothing for anyone to press.
 */
export const READ_AGAIN_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const;

/** How long before asking again, after `attempt` failures. */
export function readAgainIn(attempt: number): number {
  return READ_AGAIN_MS[Math.min(Math.max(attempt, 0), READ_AGAIN_MS.length - 1)];
}

/** Google's own words for a refusal, as the screens and run logs quote them. */
function googleWords(failure: { reason: string; status: number; detail: string }): string {
  return `${failure.reason} ${failure.status}: ${failure.detail}`.slice(0, 300);
}

/**
 * Read from Google what the admin chooses from (§3, steps 4 and 5): the
 * property's name, time zone and currency, the website's own addresses when
 * they are not known yet, the property's key events, and the events that read
 * as enquiries seen in the last 12 months (BT2) — each with how many the
 * website had in the last 30 days and the value Analytics gives each.
 * `thenCollect`: read before the website is collected again, whole (BT4),
 * which then starts.
 */
export const readWhatCounts = internalAction({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    thenCollect: v.optional(v.boolean()),
    /** Asked again after a failure (BR1): how many times before, and the property it was for. */
    attempt: v.optional(v.number()),
    property: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const target = await ctx.runQuery(internal.googleAnalyticsConnect.countingTarget, { connectionId: args.connectionId });
    if (!target) return null;
    // Asked again: only while the same property's events are still to be read, so a choice made meanwhile wins.
    if (args.attempt !== undefined && (!target.waiting || target.property !== args.property)) return null;
    const failedWith = async (problem: "GOOGLE_BUSY" | "NO_ACCESS" | "REVOKED" | "UNREADABLE" | "NOT_CONFIGURED", detail?: string): Promise<null> => {
      await ctx.runMutation(internal.googleAnalyticsConnect.readFailed, {
        connectionId: args.connectionId,
        property: target.property,
        problem,
        ...(detail ? { detail } : {}),
        attempt: args.attempt ?? 0,
        ...(args.thenCollect ? { thenCollect: true } : {}),
      });
      return null;
    };
    const token = await accessTokenFor(ctx, args.connectionId);
    if (!token.ok) return await failedWith(token.problem);
    const details = await propertyDetails(token.accessToken, target.property);
    // The property's own time zone is known from here on; until then, yesterday in UTC.
    const newest = details.ok ? newestWholeDayIn(Date.now(), details.details.timeZone) : yesterdayUtc(Date.now());
    const addresses = target.addresses
      ? { ok: true as const, found: { addresses: target.addresses, others: null } }
      : await siteAddresses(token.accessToken, target.property, target.host, newest);
    const keyEvents = await listKeyEvents(token.accessToken, target.property);
    if (!details.ok || !addresses.ok || !keyEvents.ok) {
      const refused = [details, addresses, keyEvents].find((answer) => !answer.ok);
      if (!refused || refused.ok) return null;
      return await failedWith(refused.reason === "ACCESS" ? "NO_ACCESS" : "GOOGLE_BUSY", googleWords(refused));
    }
    // Every address's events, and the other addresses visitors reach from the website (conversion-addresses-plan.md).
    const keyNames = new Set(keyEvents.events.map((event) => event.eventName));
    const own = addresses.found.addresses;
    const read = await readEventsByAddress(token.accessToken, target.property, { own, site: target.host, country: target.country, newest, keyNames, before: target.held });
    if (!read.ok) return await failedWith(read.reason === "ACCESS" ? "NO_ACCESS" : "GOOGLE_BUSY", googleWords(read));
    const { enquiries, held } = read;
    await ctx.runMutation(internal.googleAnalyticsConnect.writeWhatCounts, {
      connectionId: args.connectionId,
      property: target.property,
      propertyName: details.details.displayName,
      timeZone: details.details.timeZone,
      currency: details.details.currencyCode,
      addresses: own,
      ...(addresses.found.others ? { otherAddresses: addresses.found.others } : {}),
      addressesRead: held,
      events: [
        ...keyEvents.events.map((event) => ({ eventName: event.eventName, defaultValue: event.defaultValue, keyEvent: true, perVisit: event.perVisit })),
        ...enquiries.map((eventName) => ({ eventName, defaultValue: null, keyEvent: false, perVisit: false })),
      ].map(({ defaultValue, ...event }) => {
        const { times, value } = read.counting(event.eventName);
        // Analytics' own value: the event's default, or the average of the values sent with it.
        const sent = times > 0 && value > 0 ? Math.round((value / times) * 100) / 100 : null;
        return { ...event, analyticsValue: defaultValue ?? sent, lastThirtyDays: read.ownCount(event.eventName) };
      }),
      ...(args.thenCollect ? { thenCollect: true } : {}),
    });
    return null;
  },
});

/**
 * What was read, kept for the admin's choice. An event already ticked keeps
 * its tick and its Hakken value; a new one is ticked only when it is nearly
 * always a conversion (`tickedAtFirst`) — and one that is not a key event only
 * when no key event is ticked, so a key event built from it is never counted
 * beside it (conversions-back-in-time-plan.md BT5).
 *
 * The events are listed as Hakken now counts them (`listedWith`). An event
 * listed for the first time on a connected website has no history kept yet:
 * the website is collected again, whole (BT3, BT4), at once when `thenCollect`
 * asks or no run is under way, else on its next run.
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
    addressesRead: v.optional(v.array(heldAddressValidator)),
    events: v.array(v.object({
      eventName: v.string(),
      analyticsValue: v.union(v.number(), v.null()),
      lastThirtyDays: v.number(),
      keyEvent: v.boolean(),
      perVisit: v.boolean(),
    })),
    thenCollect: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Another property chosen meanwhile: this reading is not its.
    if (!connection || connection.property !== args.property) return null;
    const before = new Map((connection.events ?? []).map((event) => [event.eventName, event]));
    const firstTime = connection.events === undefined;
    const keyTicked = args.events.some((event) => event.keyEvent && tickedAtFirst(event.eventName));
    const grew = !firstTime && args.events.some((event) => !before.has(event.eventName));
    // The addresses whose conversions count moved (conversion-addresses-plan.md): the figures are collected again, whole.
    const moved = args.addressesRead !== undefined && !sameHosts(conversionAddressesOf(connection.addressesRead), conversionAddressesOf(args.addressesRead));
    const connected = connection.status === "CONNECTED";
    await ctx.db.patch(connection._id, {
      propertyName: args.propertyName,
      timeZone: args.timeZone,
      currency: args.currency,
      addresses: args.addresses,
      ...(args.otherAddresses ? { otherAddresses: args.otherAddresses } : {}),
      ...(args.addressesRead ? { addressesRead: args.addressesRead } : {}),
      ...(moved ? { addressesMovedAt: Date.now() } : {}),
      events: args.events.map((event) => {
        const held = before.get(event.eventName);
        return {
          eventName: event.eventName,
          counted: held ? held.counted : firstTime && tickedAtFirst(event.eventName) && (event.keyEvent || !keyTicked),
          analyticsValue: event.analyticsValue,
          hakkenValue: held?.hakkenValue ?? null,
          lastThirtyDays: event.lastThirtyDays,
          keyEvent: event.keyEvent,
          perVisit: event.perVisit,
        };
      }),
      eventsReadAt: Date.now(),
      listedWith: LISTED_WITH,
      // Read at last (BR1): no read waiting, and a connection still choosing has nothing wrong left to say.
      readAgainAt: undefined,
      ...(connection.status === "COUNTING" ? { problem: undefined, problemAt: undefined, problemDetail: undefined } : {}),
      ...((grew || moved) && connected ? { countedWith: undefined } : {}),
      updatedAt: Date.now(),
    });
    if (connected && (args.thenCollect || ((grew || moved) && !connection.collecting))) await startFirstCollection(ctx, (await ctx.db.get(connection._id))!);
    return null;
  },
});

/** Whether two lists name the same addresses, in any order. */
function sameHosts(left: readonly string[], right: readonly string[]): boolean {
  const before = new Set(left.map((host) => host.toLowerCase()));
  return left.length === right.length && right.every((host) => before.has(host.toLowerCase()));
}

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
    /** The other addresses' ticks: whether each one's conversions and sales count (conversion-addresses-plan.md). */
    addresses: v.optional(v.array(v.object({ host: v.string(), counted: v.boolean() }))),
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
        throw appError("NOT_FOUND", `${event.eventName} is not one of the events this property's connection lists.`);
      }
      if (event.hakkenValue !== null && (!Number.isFinite(event.hakkenValue) || event.hakkenValue < 0 || event.hakkenValue > MOST_VALUE)) {
        throw appError("INVALID_INPUT", `A value must be between 0 and ${MOST_VALUE.toLocaleString("en-GB")}.`);
      }
    }
    const ticks = new Map((args.addresses ?? []).map((address) => [address.host, address.counted]));
    for (const host of ticks.keys()) {
      if (!(connection.addressesRead ?? []).some((address) => address.host === host)) {
        throw appError("NOT_FOUND", `${host} is not one of the addresses this property's connection lists.`);
      }
    }
    // An address's tick is held only where it differs from Hakken's own choice, so Hakken's next reading can move the rest.
    const addressesRead = connection.addressesRead?.map((address) => {
      const tick = ticks.get(address.host);
      if (tick === undefined) return address;
      const { counted: _held, ...rest } = address;
      return tick === hakkenCounts(address) ? rest : { ...rest, counted: tick };
    });
    const now = Date.now();
    const first = connection.status === "COUNTING";
    const another = first && connection.dataProperty !== undefined && connection.dataProperty !== connection.property;
    // Another address counting on a connected website: its figures are collected again, whole (conversion-addresses-plan.md).
    const moved = !first && !sameHosts(conversionAddressesOf(connection.addressesRead), conversionAddressesOf(addressesRead));
    // What counts changed: Insights' months counted the old way are asked again on its next run (BT3, BT6).
    const countedBefore = new Set(connection.events.filter((event) => event.counted).map((event) => event.eventName));
    const countedNow = new Set(connection.events.filter((held) => chosen.get(held.eventName)?.counted ?? held.counted).map((held) => held.eventName));
    if (!first && (countedBefore.size !== countedNow.size || [...countedNow].some((name) => !countedBefore.has(name)))) {
      await forgetCountedHistory(ctx, connection.companyWebsiteId);
    }
    await ctx.db.patch(connection._id, {
      events: connection.events.map((held) => {
        const event = chosen.get(held.eventName);
        return event ? { ...held, counted: event.counted, hakkenValue: event.hakkenValue } : held;
      }),
      ...(addressesRead ? { addressesRead } : {}),
      ...(moved ? { countedWith: undefined, addressesMovedAt: now } : {}),
      ...(first
        ? {
          status: "CONNECTED" as const,
          dataProperty: connection.property,
          connectedBy: ctx.userId,
          connectedAt: now,
          disconnectedAt: undefined,
          problem: undefined,
          problemAt: undefined,
          problemDetail: undefined,
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
        addresses: conversionAddressesOf(addressesRead),
      }),
    });
    // Another property's figures go first; collecting starts at once, for this website alone (§10, Q15).
    if (another) await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.clearFigures, { companyWebsiteId: connection.companyWebsiteId });
    else if (first || (moved && !connection.collecting)) await startFirstCollection(ctx, (await ctx.db.get(connection._id))!);
    if (first) {
      const website = await ctx.db.get(connection.websiteId);
      const host = website?.displayHost ?? website?.host ?? "";
      await tellSuperAdmins(ctx, connection, `${host} is connected to Google Analytics`, "Its last 90 days are coming in now, newest week first.", `/app/analytics/${connection.companyWebsiteId}`, "GOOGLE_ANALYTICS_CONNECTED");
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
      problemDetail: undefined,
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
    // The website's page list shows Analytics' visits only while connected: rebuilt that night (dataforseo-cost-plan.md, A1).
    await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
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
  args: { connectionId: v.id("googleAnalyticsConnections"), problem: analyticsProblemValidator, detail: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    await noteProblemOn(ctx, connection, args.problem, args.detail);
    return null;
  },
});

async function noteProblemOn(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">, problem: Doc<"googleAnalyticsConnections">["problem"] & string, detail?: string) {
  const now = Date.now();
  const reconnect = problem === "REVOKED" || problem === "NO_ACCESS" || problem === "UNREADABLE";
  const working = connection.status === "CONNECTED" || connection.status === "COUNTING";
  await ctx.db.patch(connection._id, {
    problem,
    problemAt: now,
    problemDetail: detail,
    ...(reconnect && working ? { status: "NEEDS_RECONNECT" as const, readAgainAt: undefined } : {}),
    updatedAt: now,
  });
  // Its visits leave the hold's pages at their next rebuild, as Search Console's clicks do when it stops.
  if (reconnect && connection.status === "CONNECTED") await noteHoldPagesChanged(ctx, connection.companyWebsiteId);
}

/**
 * Reading a property's events failed (ga-big-site-reliability-plan.md BR1):
 * the problem kept with Google's words and, when it is Google's and not the
 * account's, the read asked again by itself after `readAgainIn` — the time
 * kept, so the screen says when.
 */
export const readFailed = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    problem: analyticsProblemValidator,
    detail: v.optional(v.string()),
    attempt: v.number(),
    thenCollect: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    await noteProblemOn(ctx, connection, args.problem, args.detail);
    // The account can no longer read it, or the sign-in is gone: a person must connect again, and the screen says so.
    if (args.problem !== "GOOGLE_BUSY") return null;
    const wait = readAgainIn(args.attempt);
    await ctx.db.patch(connection._id, { readAgainAt: Date.now() + wait });
    await ctx.scheduler.runAfter(wait, internal.googleAnalyticsConnect.readWhatCounts, {
      connectionId: args.connectionId,
      property: args.property,
      attempt: args.attempt + 1,
      ...(args.thenCollect ? { thenCollect: true } : {}),
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

/** The days in Search Console's month: its 30 days to its newest, a record each, with room to spare. */
const SEARCH_CONSOLE_MONTH = 30;

export const searchConsoleMonthValidator = v.union(v.null(), v.object({ clicks: v.number(), impressions: v.number() }));

/**
 * Search Console's last 30 days — Google's showings of the website's pages and
 * the clicks they got — for What Hakken sees on Overview and on Not connected
 * yet (google-analytics-plan.md §14): its day totals, about 30 small records,
 * read by the website's own hold. Null when Search Console holds nothing.
 */
export async function searchConsoleMonth(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  consoleConnection?: Doc<"searchConsoleConnections"> | null,
): Promise<{ clicks: number; impressions: number } | null> {
  const held = consoleConnection === undefined ? await searchConsoleOf(ctx, companyWebsiteId) : consoleConnection;
  const newest = held?.newestDay;
  if (!newest) return null;
  const days = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", undefined).eq("searchType", "web")
      .gte("day", shiftDay(newest, -(SEARCH_CONSOLE_MONTH - 1))).lte("day", newest))
    .take(SEARCH_CONSOLE_MONTH + 1);
  if (days.length === 0) return null;
  return {
    clicks: days.reduce((sum, day) => sum + day.clicks, 0),
    impressions: days.reduce((sum, day) => sum + day.impressions, 0),
  };
}

/** Whether a website's pages show the way to connect (`AnalyticsGate`): nothing connected, or nothing ever collected. */
function connectShown(connection: Doc<"googleAnalyticsConnections"> | null): boolean {
  if (!connection || connection.status === "CONNECTING") return true;
  return !connection.newestDay && (connection.status === "NEEDS_RECONNECT" || connection.status === "DISCONNECTED");
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
  /**
   * The other addresses read with the events (conversion-addresses-plan.md): each one's conversions counting or not,
   * and Hakken's own choice beside it.
   */
  addressesRead: v.array(v.object({
    host: v.string(),
    kind: heldAddressValidator.fields.kind,
    reached: v.boolean(),
    events: heldAddressValidator.fields.events,
    counted: v.boolean(),
    hakken: v.boolean(),
  })),
  timeZone: orNull(v.string()),
  currency: orNull(v.string()),
  /** Null while the key events are read from Google. */
  events: v.union(v.array(countedEventValidator), v.null()),
  /** Listed events that count the same day for day: one is very likely a copy of the other (BT5). */
  copies: v.array(v.object({ eventName: v.string(), of: v.string() })),
  connectedAt: v.union(v.number(), v.null()),
  disconnectedAt: v.union(v.number(), v.null()),
  newestDay: orNull(v.string()),
  oldestDay: orNull(v.string()),
  historyDone: v.boolean(),
  clearing: v.boolean(),
  lastCollectedAt: v.union(v.number(), v.null()),
  collecting: v.union(v.null(), v.object({ from: v.string(), top: v.string() })),
  problem: v.union(analyticsProblemValidator, v.null()),
  problemDetail: orNull(v.string()),
  readAgainAt: v.union(v.number(), v.null()),
  attempt: v.union(v.null(), v.object({ outcome: analyticsAttemptValidator, account: orNull(v.string()), at: v.number() })),
  /** The tracking health checks' last results (§6). */
  health: v.union(v.null(), v.object({ checkedAt: v.number(), checks: v.array(healthResultValidator) })),
  /** Visits on each of the property's addresses over the last 30 days: the other addresses a check names (ga-tracking-health-plan.md TH2). */
  hostVisits: v.union(v.null(), v.array(v.object({ host: v.string(), visits: v.number() }))),
  /** Listed events and sales on each address over the last 30 days: the addresses "conversions elsewhere" names (conversion-addresses-plan.md). */
  hostConversions: v.union(v.null(), v.array(v.object({ host: v.string(), conversions: v.number() }))),
  /** A shop, as its last 90 days' events say: the Products page shows only for one (§18.6.6). */
  shop: v.boolean(),
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
    /**
     * Search Console's last 30 days, read only while the pages show the way
     * to connect and Search Console is connected: What Hakken sees on Not
     * connected yet says what its clicks cannot (§14, screen 12).
     */
    searchConsole: searchConsoleMonthValidator,
    connection: v.union(v.null(), statusConnectionValidator),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const connection = await connectionOfHold(ctx, site.hold._id);
    const consoleConnection = await searchConsoleOf(ctx, site.hold._id);
    const consoleConnected = consoleConnection?.status === "CONNECTED";
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
      searchConsoleConnected: consoleConnected,
      searchConsole: consoleConnected && connectShown(connection) ? await searchConsoleMonth(ctx, site.hold._id, consoleConnection) : null,
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
    addressesRead: (connection.addressesRead ?? []).map((address) => ({
      host: address.host,
      kind: address.kind,
      reached: address.reached,
      events: address.events,
      counted: countsConversions(address),
      hakken: hakkenCounts(address),
    })),
    timeZone: connection.timeZone ?? null,
    currency: connection.currency ?? null,
    events: connection.eventsReadAt !== undefined ? connection.events ?? [] : null,
    copies: connection.copies ?? [],
    connectedAt: connection.connectedAt ?? null,
    disconnectedAt: connection.disconnectedAt ?? null,
    newestDay: connection.newestDay ?? null,
    shop: connection.shop === true,
    oldestDay: connection.oldestDay ?? null,
    historyDone: connection.backfilledAt !== undefined,
    clearing: connection.clearing === true,
    lastCollectedAt: connection.lastCollectedAt ?? null,
    collecting: connection.collecting ? { from: connection.collecting.from, top: connection.collecting.top } : null,
    problem: connection.problem ?? null,
    problemDetail: connection.problemDetail ?? null,
    readAgainAt: connection.readAgainAt ?? null,
    attempt: connection.attempt
      ? { outcome: connection.attempt.outcome, account: connection.attempt.account ?? null, at: connection.attempt.at }
      : null,
    health: connection.health ?? null,
    hostVisits: connection.hostVisits ?? null,
    hostConversions: connection.hostConversions ?? null,
  };
}
