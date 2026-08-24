import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { adminQuery, superAdminAction } from "./tenantFunctions";
import { resolveConnectorSecret } from "./connectorSecretResolver";
import { TWILIO_AUTH_TOKEN_SECRET_REF } from "./toolConnectorDefinitions";
import { getErrorMessage } from "./utils/lang";

/**
 * Connections that are really checked (seven-gaps plan, phase 2).
 *
 * The platform had a "Does it work" button that deliberately contacted
 * nothing — it read the settings and said the configuration was valid,
 * which is a different promise wearing the same words. A mailbox that had
 * silently stopped answering was discovered by a customer.
 *
 * This probes for real, once an hour and on demand: Gmail is asked for its
 * inbox, the model providers are asked for their model lists (the same body
 * the provider button runs), and the phone line is asked about its account
 * when an account id is configured. Where a live check is impossible we say
 * so rather than reporting a green light we have not earned.
 */

/** Ceilings, so these reads stay bounded as the platform grows: both tables
 * hold one row per configured connector or provider. */
const CONNECTOR_CEILING = 500;
/** Enough for any realistic deployment, and a bound so this cannot sweep. */
const TOOL_SERVER_CEILING = 200;

const PROVIDER_CEILING = 100;


export const listProbeTargetsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Bounded reads: both tables hold one row per configured thing — a few
    // dozen at most — and the ceilings keep it that way as the platform grows.
    const connectors = await ctx.db
      .query("toolConnectors")
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(CONNECTOR_CEILING);
    const providers = await ctx.db.query("aiProviders").take(PROVIDER_CEILING);
    return {
      mailboxes: connectors
        .filter((c) => c.category === "EMAIL" && c.authConnectionStatus === "CONNECTED")
        .map((c) => ({ connectorId: c._id, name: c.name })),
      phoneLines: connectors
        .filter((c) => c.category === "VOICE")
        .map((c) => ({ connectorId: c._id, name: c.name, number: c.authAccountRef })),
      providerKeys: providers.filter((p) => p.isEnabled).map((p) => p.providerKey),
    };
  },
});

export const recordConnectorProbeInternal = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    ok: v.boolean(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectorId, {
      lastProbeAt: Date.now(),
      lastProbeOk: args.ok,
      lastProbeMessage: args.message.slice(0, 300),
    });
  },
});

/** Ask Twilio about the account behind the line. Needs an account id; the
 * platform stores only the auth token (inbound webhooks are verified, not
 * called), so without one we report honestly rather than guess. */
async function probePhoneLine(): Promise<{ ok: boolean; message: string } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const connectorToken = resolveConnectorSecret(TWILIO_AUTH_TOKEN_SECRET_REF, process.env);
  const authToken = connectorToken.found
    ? connectorToken.value
    : process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
      }
    );
    if (!response.ok) {
      return { ok: false, message: `The phone provider answered ${response.status}.` };
    }
    const account = (await response.json()) as { status?: string };
    return {
      ok: account.status !== "suspended" && account.status !== "closed",
      message: `The phone provider answered. Account is ${account.status ?? "active"}.`,
    };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export const probeConnections = internalAction({
  args: {},
  handler: async (ctx) => {
    const targets = await ctx.runQuery(internal.connectionProbes.listProbeTargetsInternal, {});

    for (const mailbox of targets.mailboxes) {
      let ok = false;
      let message = "";
      try {
        const listing = (await ctx.runAction(internal.gmailConnector.readMailbox, {
          connectorId: mailbox.connectorId,
          query: "in:inbox",
        })) as { ok: boolean; error?: string; messages?: unknown[] };
        ok = listing.ok;
        message = listing.ok
          ? "The inbox answered."
          : (listing.error ?? "The inbox did not answer.");
      } catch (error) {
        message = getErrorMessage(error);
      }
      await ctx.runMutation(internal.connectionProbes.recordConnectorProbeInternal, {
        connectorId: mailbox.connectorId,
        ok,
        message,
      });
    }

    const phoneVerdict = await probePhoneLine();
    if (phoneVerdict) {
      for (const line of targets.phoneLines) {
        await ctx.runMutation(internal.connectionProbes.recordConnectorProbeInternal, {
          connectorId: line.connectorId,
          ok: phoneVerdict.ok,
          message: phoneVerdict.message,
        });
      }
    }

    for (const providerKey of targets.providerKeys) {
      try {
        await ctx.runAction(internal.aiModelsActions.probeProviderInternal, { providerKey });
      } catch {
        // probeProviderInternal records its own verdict either way; a throw
        // here must not stop the remaining providers being checked.
      }
    }
  },
});

export type ConnectionRow = {
  id: string;
  name: string;
  kind: "MAILBOX" | "PHONE" | "PROVIDER" | "WIDGET" | "TOOL_SERVER";
  /** null when nothing has ever managed a live check of this connection. */
  working: boolean | null;
  detail: string;
  checkedAt: number | null;
  /** Real activity, when the connection's own traffic is the better witness. */
  lastHeardAt: number | null;
};

/**
 * Every connection the platform depends on, in one list. Built from the
 * probe marks above plus, for the phone line, the last call actually
 * received — a line that took a call ten minutes ago is working, whatever
 * any probe says.
 */
export const listConnections = adminQuery({
  args: {},
  handler: async (ctx): Promise<ConnectionRow[]> => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to platform maintenance");
    }
    const rows: ConnectionRow[] = [];

    // Every mailbox and phone line the platform knows about, switched on or
    // not. Hiding the off ones would make "no inbox is connected" look
    // exactly like "the inbox is fine", which is the failure this screen
    // exists to prevent.
    const connectors = await ctx.db.query("toolConnectors").take(CONNECTOR_CEILING);

    for (const connector of connectors) {
      if (connector.category !== "EMAIL" && connector.category !== "VOICE") continue;
      const isMailbox = connector.category === "EMAIL";
      let lastHeardAt: number | null = null;
      let working = connector.lastProbeOk ?? null;
      let detail = connector.lastProbeMessage ?? "";

      if (!connector.isActive) {
        rows.push({
          id: connector._id,
          name: connector.name,
          kind: isMailbox ? "MAILBOX" : "PHONE",
          working: null,
          detail:
            connector.authConnectionStatus === "NOT_CONNECTED" || !connector.authConnectionStatus
              ? "Not connected yet — nothing to check."
              : "Switched off, so nothing is being checked.",
          checkedAt: null,
          lastHeardAt: null,
        });
        continue;
      }

      if (isMailbox) {
        // The watcher's own once-a-minute poll is the better witness: it runs
        // sixty times an hour, the probe once.
        if (connector.lastPolledAt) lastHeardAt = connector.lastPolledAt;
        if (connector.lastPollError) {
          working = false;
          detail = connector.lastPollError;
        }
        if (connector.authConnectionStatus === "ERROR") {
          working = false;
          detail = detail || "The connection to this mailbox needs signing in again.";
        }
      } else {
        const lastCall = await ctx.db
          .query("phoneCalls")
          .withIndex("by_started")
          .order("desc")
          .first();
        lastHeardAt = lastCall?.startedAt ?? null;
        if (!detail) {
          detail = process.env.TWILIO_ACCOUNT_SID
            ? "Waiting for the first check."
            : "No account id is set for a live check, so this row reports the last call received.";
        }
      }

      rows.push({
        id: connector._id,
        name: connector.name,
        kind: isMailbox ? "MAILBOX" : "PHONE",
        working,
        detail,
        checkedAt: connector.lastProbeAt ?? null,
        lastHeardAt,
      });
    }

    const providers = await ctx.db.query("aiProviders").take(PROVIDER_CEILING);
    for (const provider of providers) {
      if (!provider.isEnabled) continue;
      let detail = "";
      try {
        const settings = provider.settings
          ? (JSON.parse(provider.settings) as { lastHealthMessage?: string })
          : {};
        detail = settings.lastHealthMessage ?? "";
      } catch {
        detail = "";
      }
      rows.push({
        id: provider._id,
        name: provider.displayName,
        kind: "PROVIDER",
        working: provider.status === "healthy" ? true : provider.status === "error" ? false : null,
        detail: detail || "Waiting for the first check.",
        checkedAt: provider.lastHealthCheckAt ?? provider.lastSyncedAt ?? null,
        lastHeardAt: null,
      });
    }

    // Every tool server a workspace has connected. Switched-off ones are
    // listed too, for the same reason a switched-off mailbox is: "nothing is
    // connected" must not look identical to "everything is fine".
    //
    // The witness here is the last discovery. It is the only moment the
    // platform genuinely contacts one of these, so it is the only honest
    // answer to "is this working".
    const servers = await ctx.db.query("mcpServers").take(TOOL_SERVER_CEILING);
    for (const server of servers) {
      const off = server.status === "DISABLED";
      rows.push({
        id: server._id,
        name: server.name,
        kind: "TOOL_SERVER",
        working: off ? null : (server.lastDiscoveryOk ?? null),
        detail: off
          ? "Switched off, so nothing is being checked."
          : server.lastDiscoveryMessage
            ?? "Not checked yet — ask it what it offers to find out.",
        checkedAt: server.lastDiscoveryAt ?? null,
        lastHeardAt: null,
      });
    }

    // Broken and unchecked first: this screen exists to be scanned in a
    // hurry, and the rows that need a person must never be below the fold.
    return rows.sort((a, b) => {
      const rank = (row: ConnectionRow) =>
        row.working === false ? 0 : row.working === null ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  },
});

/** The "Check now" button behind the screen: probe everything, on demand. */
export const probeConnectionsNow = superAdminAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    await ctx.runAction(internal.connectionProbes.probeConnections, {});
    return null;
  },
});
