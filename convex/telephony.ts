import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildConnectTwiml,
  buildDisclosure,
  buildRefusalTwiml,
  computeTwilioSignature,
  findNumberOwner,
  parseNumberOwnership,
  signaturesMatch,
} from "./telephonyService";

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

export const handleIncomingCall = httpAction(async (ctx, request) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const streamUrl = process.env.TELEPHONY_STREAM_URL?.trim();
  const ownership = parseNumberOwnership(process.env.TELEPHONY_NUMBER_OWNERS);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 413);
  }

  const params: Record<string, string> = {};
  for (const [name, value] of new URLSearchParams(raw)) params[name] = value;

  // Unsigned means it is not the provider, whatever it claims. Refused before
  // anything is read out of the body and before a single model call.
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
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 403);
  }

  const providerCallId = params.CallSid ?? "";
  const fromNumber = params.From ?? "";
  const toNumber = params.To ?? "";
  if (!providerCallId || !toNumber) {
    return twimlResponse(buildRefusalTwiml("Sorry, something went wrong. Goodbye."), 400);
  }

  const companyId = findNumberOwner(ownership, toNumber);
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

  await ctx.runMutation(internal.telephony.upsertCallOnAnswer, {
    companyId: companyId as Id<"companies">,
    providerCallId,
    fromNumber,
    toNumber,
  });

  // The pass the stream will present to the relay. Minted here, by the
  // platform, for the same reason a browser never mints its own: whoever
  // mints it decides which company is being spoken for.
  let ticket: string;
  try {
    ticket = await ctx.runAction(internal.ai.createVoiceTicketForCompany, {
      companyId: companyId as Id<"companies">,
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
