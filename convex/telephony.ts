import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { adminQuery, moduleQuery } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import { CORE_MODULES } from "./utils/coreModules";
import { assertAdminCanAccessCompany } from "./authz";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildConnectTwiml,
  buildDisclosure,
  buildRefusalTwiml,
  computeTwilioSignature,
  findNumberOwner,
  maskPhoneNumber,
  normalisePhoneNumber,
  parseNumberOwnership,
  signaturesMatch,
} from "./telephonyService";
import { base64UrlToText, ticketIsAuthentic } from "./voiceRelay";
import { resolveConnectorSecret } from "./connectorSecretResolver";
import {
  TWILIO_AUTH_TOKEN_SECRET_REF,
  TWILIO_VOICE_CONNECTOR_KEY,
} from "./toolConnectorDefinitions";
import { rowShape } from "./utils/rowShape";

/**
 * Sonae answering the phone.
 *
 * This is a public endpoint that spends a company's model budget every time
 * it says yes, so it refuses first and answers second: the provider's
 * signature must check out, the dialled number must belong to a workspace,
 * and the platform must actually be configured to hold a live conversation.
 * Anything else is a polite sentence and a hang-up — never a dead line, which
 * is what a caller hears as "this company is broken".
 *
 * The call's audio never touches this endpoint. All this does is tell the
 * provider where to stream it, and hand over a signed pass for that stream —
 * the same pass a browser gets, so the relay has one door rather than two.
 */

const TWIML_HEADERS = { "Content-Type": "text/xml; charset=utf-8" };
/** A webhook body is a handful of form fields; anything larger is not one. */
const MAX_BODY_BYTES = 16_384;

function twimlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: TWIML_HEADERS });
}

/** Recorded on arrival so a call exists even if everything after this fails. */
export const upsertCallOnAnswer = internalMutation({
  args: {
    companyId: v.id("companies"),
    providerCallId: v.string(),
    fromNumber: v.string(),
    toNumber: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"phoneCalls">> => {
    // A provider redelivers a webhook it believes failed, so the same call
    // arriving twice must update one row rather than create a second.
    const existing = await ctx.db
      .query("phoneCalls")
      .withIndex("by_provider_call", (q) => q.eq("providerCallId", args.providerCallId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "IN_PROGRESS" });
      return existing._id;
    }

    return await ctx.db.insert("phoneCalls", {
      companyId: args.companyId,
      providerCallId: args.providerCallId,
      fromNumber: args.fromNumber,
      toNumber: args.toNumber,
      status: "IN_PROGRESS",
      turns: [],
      startedAt: Date.now(),
    });
  },
});

export const getCompanyForCall = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ name: string } | null> => {
    const company = await ctx.db.get(args.companyId);
    return company ? { name: company.name } : null;
  },
});


/**
 * Whether this call may be answered at all, decided before any model spend.
 *
 * Three ceilings, then the plan. Concurrency protects the relay; the
 * per-number ceiling stops a redialling abuser spending the company's budget;
 * the quota is commitment 6 — a call is a conversation, so answering one
 * spends one conversation from the same allowance chat spends, and a company
 * out of allowance hears "call back later" rather than a dead line.
 *
 * A mutation rather than a query, because saying yes SPENDS: the check and
 * the spend must be one atomic step, or two simultaneous calls both pass a
 * limit with one slot left.
 */
export const admitCall = internalMutation({
  args: { companyId: v.id("companies"), fromNumber: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<"OK" | "BUSY" | "REDIALLING" | "OUT_OF_QUOTA"> => {
    const maxConcurrent = readCeiling(process.env.TELEPHONY_MAX_CONCURRENT_CALLS, 4);
    const maxPerNumberPerHour = readCeiling(process.env.TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR, 6);

    // Newest 100 calls cover both windows: concurrency is now, and the
    // redial window is an hour — a company taking more than 100 calls an
    // hour has outgrown env-var ceilings and this whole arrangement.
    const recent = await ctx.db
      .query("phoneCalls")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(100);

    const inProgress = recent.filter(
      (call) => call.status === "RINGING" || call.status === "IN_PROGRESS"
    );
    if (inProgress.length >= maxConcurrent) return "BUSY";

    const hourAgo = Date.now() - 60 * 60 * 1000;
    const caller = normalisePhoneNumber(args.fromNumber);
    const fromSameNumber = recent.filter(
      (call) => call.startedAt > hourAgo && normalisePhoneNumber(call.fromNumber) === caller
    );
    if (fromSameNumber.length >= maxPerNumberPerHour) return "REDIALLING";

    const company = await ctx.db.get(args.companyId);
    if (!company) return "OUT_OF_QUOTA";
    if (company.planId) {
      const plan = await ctx.db.get(company.planId);
      if (plan && plan.messageLimit !== -1) {
        const used = company.messagesUsedThisPeriod || 0;
        if (used >= plan.messageLimit) return "OUT_OF_QUOTA";
        // The spend, in the same step as the check.
        await ctx.db.patch(args.companyId, { messagesUsedThisPeriod: used + 1 });
      }
    }
    return "OK";
  },
});

/** An env ceiling: absent or nonsense means the default, never unlimited. */
function readCeiling(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The phone line as a connector. Which workspace has claimed the dialled
 * number, and whether its switch is on — the admin screen's toggle is the
 * abuse cord: flicked off, every caller is refused politely before a penny
 * of model spend, without touching Twilio or the deployment's settings.
 */
export const findVoiceLineForNumber = internalQuery({
  args: { toNumber: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ companyId: Id<"companies">; acceptingCalls: boolean } | null> => {
    const dialled = normalisePhoneNumber(args.toNumber);
    if (!dialled) return null;
    // Bounded: a workspace holds a number or two, installed by hand.
    const lines = await ctx.db
      .query("toolConnectors")
      .withIndex("by_key", (q) => q.eq("key", TWILIO_VOICE_CONNECTOR_KEY))
      .take(100);
    const line = lines.find(
      (connector) =>
        connector.companyId !== undefined &&
        Boolean(connector.authAccountRef) &&
        normalisePhoneNumber(connector.authAccountRef ?? "") === dialled
    );
    if (!line || line.companyId === undefined) return null;
    return {
      companyId: line.companyId,
      acceptingCalls: line.isActive && line.installStatus === "INSTALLED",
    };
  },
});

export const handleIncomingCall = httpAction(async (ctx, request) => {
  const streamUrl = process.env.TELEPHONY_STREAM_URL?.trim();
  const ownership = parseNumberOwnership(process.env.TELEPHONY_NUMBER_OWNERS);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 413);
  }

  const params: Record<string, string> = {};
  for (const [name, value] of new URLSearchParams(raw)) params[name] = value;

  // The dialled number picks the credential: a number claimed by a Twilio
  // connector is verified with the connector's own token, and the
  // deployment-wide token remains for numbers still routed by environment
  // settings. Chosen before verification — like a key id, the To field only
  // selects which credential must then prove the request.
  const line = params.To
    ? await ctx.runQuery(internal.telephony.findVoiceLineForNumber, { toNumber: params.To })
    : null;
  const connectorToken = resolveConnectorSecret(TWILIO_AUTH_TOKEN_SECRET_REF, process.env);
  const authToken =
    line && connectorToken.found ? connectorToken.value : process.env.TWILIO_AUTH_TOKEN?.trim();

  // Unsigned means it is not the provider, whatever it claims. Refused before
  // a single model call.
  if (!authToken) {
    return twimlResponse(
      buildRefusalTwiml("Sorry, this number is not taking calls right now. Goodbye."),
      503
    );
  }
  const provided = request.headers.get("X-Twilio-Signature") ?? "";
  // The provider signs the URL *it* was configured to call, which is not
  // always the URL this server sees itself receiving — a proxy, a custom
  // domain or an added port is enough to differ, and the failure is a
  // permanent 403 with nothing explaining it. So the public URL can be
  // stated, and only falls back to the observed one when it has not been.
  const signedUrl = process.env.TELEPHONY_PUBLIC_URL?.trim() || request.url;
  const expected = await computeTwilioSignature(signedUrl, params, authToken);
  if (!provided || !signaturesMatch(expected, provided)) {
    // Also computed against the URL this server observed itself: when THAT
    // one matches, the configured public URL is what is wrong, and the log
    // says so in as many words. Never the signatures or the token — which
    // URL and which fields is enough to diagnose every real case.
    const observed = await computeTwilioSignature(request.url, params, authToken);
    const diagnosis = !provided
      ? "no signature header at all — this did not come through Twilio's webhook"
      : signaturesMatch(observed, provided)
        ? `TELEPHONY_PUBLIC_URL mismatch — Twilio signed ${request.url} but the setting says ${signedUrl}`
        : "signature mismatch on both URLs — the auth token is wrong, or the URL in Twilio differs from both";
    console.warn(
      `Refused a call webhook: ${diagnosis}. CallSid=${params.CallSid ?? "none"} To=${params.To ?? "none"}`
    );
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 403);
  }

  const providerCallId = params.CallSid ?? "";
  const fromNumber = params.From ?? "";
  const toNumber = params.To ?? "";
  if (!providerCallId || !toNumber) {
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 400);
  }

  // The connector's switch, honoured only after the caller is proven to be
  // the provider: off means refused politely — never a dead line, and not a
  // call row, a ticket, or a penny of model spend.
  if (line && !line.acceptingCalls) {
    return twimlResponse(
      buildRefusalTwiml(
        "Sorry, we are not taking calls at the moment. Please try again later. Goodbye."
      ),
      200
    );
  }

  const companyId = line?.companyId ?? findNumberOwner(ownership, toNumber);
  if (!companyId) {
    // A number nobody has claimed. Said plainly rather than left ringing.
    return twimlResponse(
      buildRefusalTwiml("Sorry, this number is not in service. Goodbye."),
      200
    );
  }

  const company = await ctx.runQuery(internal.telephony.getCompanyForCall, {
    companyId: companyId as Id<"companies">,
  });
  if (!company) {
    return twimlResponse(
      buildRefusalTwiml("Sorry, this number is not in service. Goodbye."),
      200
    );
  }

  // The ceilings, and the plan. Checked after the caller is proven to be the
  // provider and the number proven owned — but before a record, a ticket, or
  // a penny of model spend.
  const admission = await ctx.runMutation(internal.telephony.admitCall, {
    companyId: companyId as Id<"companies">,
    fromNumber,
  });
  if (admission !== "OK") {
    const refusals = {
      BUSY: "Sorry, all our lines are busy at the moment. Please call back shortly. Goodbye.",
      REDIALLING: "Sorry, this number has called several times recently. Please try again later. Goodbye.",
      OUT_OF_QUOTA: "Sorry, I cannot take calls at the moment. Please call back later. Goodbye.",
    } as const;
    return twimlResponse(buildRefusalTwiml(refusals[admission]), 200);
  }

  await ctx.runMutation(internal.telephony.upsertCallOnAnswer, {
    companyId: companyId as Id<"companies">,
    providerCallId,
    fromNumber,
    toNumber,
  });

  // A known caller's wiki page joins the session's instructions (wiki plan,
  // phase 2). Fetched fail-open: a page lookup that dies must never cost a
  // caller their call.
  let callerPage: string | undefined;
  try {
    const rendered = await ctx.runQuery(internal.wikiPages.getRenderedPageForPhoneNumber, {
      companyId: companyId as Id<"companies">,
      phoneNumber: fromNumber,
    });
    callerPage = rendered?.pageText;
  } catch (error) {
    console.error("Caller wiki page lookup failed; answering without it", error);
  }

  // The pass the stream will present to the relay. Minted here, by the
  // platform, for the same reason a browser never mints its own: whoever
  // mints it decides which company is being spoken for.
  let ticket: string;
  try {
    ticket = await ctx.runAction(internal.aiVoiceSession.createVoiceTicketForCompany, {
      companyId: companyId as Id<"companies">,
      ...(callerPage ? { callerPage } : {}),
    });
  } catch (error) {
    console.error("Could not open a voice session for a call", error);
    return twimlResponse(
      buildRefusalTwiml("Sorry, I cannot take your call right now. Please try again shortly."),
      200
    );
  }

  if (!streamUrl) {
    return twimlResponse(
      buildRefusalTwiml("Sorry, this number is not taking calls right now. Goodbye."),
      200
    );
  }

  return twimlResponse(
    buildConnectTwiml({ disclosure: buildDisclosure(company.name), streamUrl, ticket })
  );
});

/**
 * The transcript arriving while the call is still going.
 *
 * The bridge hears both sides as the live model transcribes them, and posts
 * each finished turn here, presenting the call's own ticket. Bounded twice:
 * the body size, and the turns a call may accumulate — a caller who never
 * hangs up must not grow a row without end.
 */
const MAX_TURNS_PER_CALL = 400;
// The ticket rides in every post and carries the company's full instructions
// — see the knowledge endpoint's limit for the 413 this once caused.
const MAX_TURN_BODY_BYTES = 128 * 1024;
/** Lookups mid-call are bounded by session length, exactly as knowledge is. */
const MAX_CALL_SESSION_MS = 15 * 60 * 1000;

export const appendCallTurns = internalMutation({
  args: {
    providerCallId: v.string(),
    companyId: v.id("companies"),
    turns: v.array(
      v.object({
        role: v.union(v.literal("CALLER"), v.literal("SONAE")),
        text: v.string(),
        at: v.number(),
      })
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const call = await ctx.db
      .query("phoneCalls")
      .withIndex("by_provider_call", (q) => q.eq("providerCallId", args.providerCallId))
      .first();
    // The ticket names the company; the call row must agree, or a pass for
    // one workspace is writing into another's call record.
    if (!call || call.companyId !== args.companyId) return;

    const room = MAX_TURNS_PER_CALL - call.turns.length;
    if (room <= 0) return;
    await ctx.db.patch(call._id, {
      turns: [...call.turns, ...args.turns.slice(0, room)],
    });
  },
});

export const handleCallTurns = httpAction(async (ctx, request) => {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) return new Response(null, { status: 503 });

  const raw = await request.text();
  if (raw.length > MAX_TURN_BODY_BYTES) return new Response(null, { status: 413 });

  let body: { ticket?: unknown; callSid?: unknown; turns?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }

  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const callSid = typeof body.callSid === "string" ? body.callSid : "";
  const [payloadPart, signaturePart] = ticket.split(".");
  if (!payloadPart || !signaturePart || !callSid) return new Response(null, { status: 401 });

  let authentic = false;
  try {
    authentic = await ticketIsAuthentic(payloadPart, signaturePart, secret);
  } catch {
    authentic = false;
  }
  if (!authentic) return new Response(null, { status: 401 });

  let payload: { companyId?: string | null; expiresAt?: number };
  try {
    payload = JSON.parse(base64UrlToText(payloadPart)) as typeof payload;
  } catch {
    return new Response(null, { status: 401 });
  }
  if (
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt + MAX_CALL_SESSION_MS < Date.now() ||
    !payload.companyId
  ) {
    return new Response(null, { status: 401 });
  }

  const turns = Array.isArray(body.turns)
    ? body.turns
        .filter(
          (turn): turn is { role: "CALLER" | "SONAE"; text: string } =>
            !!turn &&
            (turn.role === "CALLER" || turn.role === "SONAE") &&
            typeof turn.text === "string" &&
            turn.text.trim().length > 0
        )
        .slice(0, 40)
        .map((turn) => ({ role: turn.role, text: turn.text.trim().slice(0, 2000), at: Date.now() }))
    : [];
  if (turns.length === 0) return new Response(null, { status: 200 });

  await ctx.runMutation(internal.telephony.appendCallTurns, {
    providerCallId: callSid,
    companyId: payload.companyId as Id<"companies">,
    turns,
  });
  return new Response(null, { status: 200 });
});

/**
 * The hang-up-and-watch step.
 *
 * The provider says the call has ended; within seconds the transcript is
 * summarised, the caller is matched against the CRM, a follow-up task lands
 * with a named person, and their bell rings. Everything goes through the
 * existing doors — the task door validates, audits and notifies on its own.
 */
export const markCallEnded = internalMutation({
  args: {
    providerCallId: v.string(),
    outcome: v.union(v.literal("COMPLETED"), v.literal("FAILED")),
    endedReason: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"phoneCalls"> | null> => {
    const call = await ctx.db
      .query("phoneCalls")
      .withIndex("by_provider_call", (q) => q.eq("providerCallId", args.providerCallId))
      .first();
    if (!call) return null;
    // Terminal states do not regress: a late-arriving duplicate of an
    // earlier status must not reopen a completed call.
    if (call.status === "COMPLETED" || call.status === "FAILED") return null;

    await ctx.db.patch(call._id, {
      status: args.outcome,
      endedAt: Date.now(),
      endedReason: args.endedReason,
    });
    return call._id;
  },
});

export const getCallInternal = internalQuery({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args) => await ctx.db.get(args.callId),
});

/** Who a call's follow-up lands with, until a per-company setting exists. */
export const findCallAssignee = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<Id<"users"> | null> => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(200);
    if (users.length === 0) return null;
    // The workspace's own admin if it has one, otherwise its earliest member
    // — somebody always owns a caller, or the bell rings for nobody.
    const admin = users.find((user) => user.role === "ADMIN");
    return (admin ?? users[0])._id;
  },
});

/**
 * The caller matched against the workspace's own customers.
 *
 * Account-keyed CRM discipline: a match links the call to the customer it
 * found; an unknown caller never becomes a CRM row. Numbers are compared
 * normalised, because the provider sends E.164 and a spreadsheet holds
 * whatever a person typed.
 */
export const matchCallerToCustomer = internalMutation({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args): Promise<string | null> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const caller = normalisePhoneNumber(call.fromNumber);
    if (!caller) return null;

    const customers = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) => q.eq("companyId", call.companyId))
      .take(2000);
    const match = customers.find(
      (customer) =>
        (customer.phone && normalisePhoneNumber(customer.phone) === caller) ||
        (customer.mobile && normalisePhoneNumber(customer.mobile) === caller)
    );
    if (!match) return null;

    await ctx.db.patch(args.callId, { matchedCustomerKey: match.accountNameKey });
    return match.accountNameKey;
  },
});

export const attachCallSummary = internalMutation({
  args: { callId: v.id("phoneCalls"), summary: v.string(), taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.callId, {
      summary: args.summary,
      ...(args.taskId ? { taskId: args.taskId } : {}),
    });
  },
});

/**
 * The provider reporting how the call ended.
 *
 * Configured on the number as its status callback. Signature-checked exactly
 * like the voice webhook — an unauthenticated caller must not be able to end
 * calls, let alone trigger model spend through the summary step.
 */
export const handleCallStatus = httpAction(async (ctx, request) => {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const params: Record<string, string> = {};
  for (const [name, value] of new URLSearchParams(raw)) params[name] = value;

  // The same credential choice as the voice webhook. A switched-off line
  // still gets its status callbacks honoured — a call already in progress
  // when the switch flips must be allowed to end properly.
  const line = params.To
    ? await ctx.runQuery(internal.telephony.findVoiceLineForNumber, { toNumber: params.To })
    : null;
  const connectorToken = resolveConnectorSecret(TWILIO_AUTH_TOKEN_SECRET_REF, process.env);
  const authToken =
    line && connectorToken.found ? connectorToken.value : process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return new Response(null, { status: 503 });

  const provided = request.headers.get("X-Twilio-Signature") ?? "";
  const signedUrl = process.env.TELEPHONY_STATUS_PUBLIC_URL?.trim() || request.url;
  const expected = await computeTwilioSignature(signedUrl, params, authToken);
  if (!provided || !signaturesMatch(expected, provided)) {
    return new Response(null, { status: 403 });
  }

  const providerCallId = params.CallSid ?? "";
  const status = params.CallStatus ?? "";
  if (!providerCallId) return new Response(null, { status: 400 });

  // Anything the provider counts as over. In-progress updates are not ours
  // to act on — the bridge sees the call end for itself.
  const TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);
  if (!TERMINAL.has(status)) return new Response(null, { status: 200 });

  const callId = await ctx.runMutation(internal.telephony.markCallEnded, {
    providerCallId,
    outcome: status === "completed" ? ("COMPLETED" as const) : ("FAILED" as const),
    endedReason: status,
  });

  // The finale runs after the response returns: the provider is answered
  // immediately, and the task/bell/summary land seconds later.
  if (callId) {
    await ctx.scheduler.runAfter(0, internal.telephonyActions.runAfterCallStep, { callId });
  }
  return new Response(null, { status: 200 });
});

const callStatusValidator = v.union(
  v.literal("RINGING"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
  v.literal("FAILED")
);

/**
 * The screen behind the presenter.
 *
 * The list keeps callers' numbers masked — a room full of people can read
 * this display, and the demo is a stranger's number appearing on it. The
 * full number exists in exactly one place: the call's own detail view.
 */
export const listCalls = moduleQuery({
  module: CORE_MODULES.calls,
  args: {},
  /**
   * What the recent-calls list draws: a masked number, the state, the time,
   * one line of summary and the customer it matched. The caller's real
   * number never leaves here — `fromMasked` is the only form of it this
   * surface knows — and neither does the follow-up task id or the end time,
   * because the list renders neither. Both live on the call's own page.
   */
  returns: v.array(
    v.object({
      _id: v.id("phoneCalls"),
      fromMasked: v.string(),
      status: callStatusValidator,
      startedAt: v.number(),
      summary: v.optional(v.string()),
      matchedCustomerKey: v.optional(v.string()),
      turnCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];

    const calls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(50);

    return calls.map((call) => ({
      _id: call._id,
      fromMasked: maskPhoneNumber(call.fromNumber),
      status: call.status,
      startedAt: call.startedAt,
      ...(call.summary === undefined ? {} : { summary: call.summary }),
      ...(call.matchedCustomerKey === undefined
        ? {}
        : { matchedCustomerKey: call.matchedCustomerKey }),
      turnCount: call.turns.length,
    }));
  },
});

export const getCall = moduleQuery({
  module: CORE_MODULES.calls,
  // A string, not an id: this value arrives straight from the address bar,
  // and a mistyped link must read as "not found" rather than an error page.
  args: { callId: v.string() },
  /**
   * One call, as its page reads it — the transcript, the summary, and the
   * caller's whole number, which appears here and nowhere else.
   *
   * The whole row used to leave. That also handed the browser `toNumber`
   * (the company's own line), `providerCallId` (the telephony provider's
   * key for the call, and this table's idempotency key), `threadId`, and
   * the timestamp on every spoken turn. The page renders none of the four,
   * and two of them are raw telephone identifiers.
   */
  returns: v.union(
    v.null(),
    v.object({
      fromNumber: v.string(),
      status: callStatusValidator,
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
      summary: v.optional(v.string()),
      matchedCustomerKey: v.optional(v.string()),
      taskId: v.optional(v.id("tasks")),
      turns: v.array(
        v.object({
          role: v.union(v.literal("CALLER"), v.literal("SONAE")),
          text: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    if (!companyId) return null;
    const callId = ctx.db.normalizeId("phoneCalls", args.callId);
    if (!callId) return null;
    const call = await ctx.db.get(callId);
    // The tenant boundary, asserted on the row itself.
    if (!call || call.companyId !== companyId) return null;
    return {
      fromNumber: call.fromNumber,
      status: call.status,
      startedAt: call.startedAt,
      ...(call.endedAt === undefined ? {} : { endedAt: call.endedAt }),
      ...(call.summary === undefined ? {} : { summary: call.summary }),
      ...(call.matchedCustomerKey === undefined
        ? {}
        : { matchedCustomerKey: call.matchedCustomerKey }),
      ...(call.taskId === undefined ? {} : { taskId: call.taskId }),
      turns: call.turns.map((turn) => ({ role: turn.role, text: turn.text })),
    };
  },
});

/**
 * The admin's view of a company's calls (seven-gaps plan, phase 1): the
 * work was always recorded, but an admin looking at a company could not
 * see it. Same shape and same masking as the tenant list — the full
 * number appears only on the call's own page, at either height.
 */
export const listCallsForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("RINGING"),
        v.literal("IN_PROGRESS"),
        v.literal("COMPLETED"),
        v.literal("FAILED")
      )
    ),
  },
  returns: governanceShapes.callListShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const searchTerm = args.searchTerm?.trim();
    // Searching, filtering and paging all happen here rather than in the
    // browser: a company with a year of calls must cost the same to open as
    // one with five.
    const page = searchTerm
      ? await ctx.db
        .query("phoneCalls")
        .withSearchIndex("search_summary", (q) => {
          const search = q.search("summary", searchTerm).eq("companyId", args.companyId);
          return search;
        })
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("phoneCalls")
        .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId))
        .order("desc")
        .paginate(args.paginationOpts);

    const filtered = args.status
      ? page.page.filter((call) => call.status === args.status)
      : page.page;

    return {
      ...page,
      page: filtered.map((call) => ({
        _id: call._id,
        fromMasked: maskPhoneNumber(call.fromNumber),
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        summary: call.summary,
        matchedCustomerKey: call.matchedCustomerKey,
        taskId: call.taskId,
        turnCount: call.turns.length,
      })),
    };
  },
});

export const getCallForCompany = adminQuery({
  // A string, not an id: the value arrives from the address bar and a
  // mistyped link must read as "not found", exactly as the tenant door does.
  args: { companyId: v.id("companies"), callId: v.string() },
  returns: v.union(rowShape.phoneCalls, v.null()),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const callId = ctx.db.normalizeId("phoneCalls", args.callId);
    if (!callId) return null;
    const call = await ctx.db.get(callId);
    if (!call || call.companyId !== args.companyId) return null;
    return call;
  },
});

/**
 * The company's own number, read from the same setting that routes calls to
 * it — so the screen and the switchboard cannot disagree about what to dial.
 */
export const getCompanyPhoneNumber = moduleQuery({
  module: CORE_MODULES.calls,
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx): Promise<string | null> => {
    const { companyId } = ctx;
    if (!companyId) return null;
    // The connector's claim first — the same row the admin screen edits —
    // then the environment setting for numbers not yet moved over.
    const lines = await ctx.db
      .query("toolConnectors")
      .withIndex("by_key", (q) => q.eq("key", TWILIO_VOICE_CONNECTOR_KEY))
      .take(100);
    const line = lines.find(
      (connector) => connector.companyId === companyId && connector.authAccountRef
    );
    if (line?.authAccountRef) return line.authAccountRef;
    const ownership = parseNumberOwnership(process.env.TELEPHONY_NUMBER_OWNERS);
    const entry = Object.entries(ownership).find(([, owner]) => owner === companyId);
    return entry?.[0] ?? null;
  },
});
