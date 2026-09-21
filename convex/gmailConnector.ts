import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { appError } from "./utils/appError";

/**
 * The Gmail connector's working half: reading the connected mailbox and
 * replying from it, over the consent-flow token (`connectorOAuth`).
 *
 * The reply rails (commitment 6 of the Gmail plan) live here, beyond the
 * model's reach: a reply can only go to the sender of a message the mailbox
 * received — the model supplies a message id and a body, never an address —
 * never to a no-reply sender, at most one automatic reply per thread per
 * hour, and at most a fixed number per day. Exceeding a rail files a task
 * instead, so a person always hears about the mail the machine would not
 * answer.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * The shortest gap between two automatic replies in one conversation.
 *
 * Email is a conversation, and the mailbox holds its end of one — the first
 * live test had an hour-long per-thread silence here, which made a customer's
 * follow-up sit unanswered and was rightly judged useless. What this gap
 * still prevents is the pathological case: two automatic systems answering
 * each other faster than any human types.
 */
const THREAD_REPLY_MIN_GAP_MS = 90 * 1000;

/** No conversation gets more than this many automatic replies in a day. */
export const THREAD_DAILY_REPLY_CAP = 10;

/** The mailbox will not send more than this in any rolling day. */
export const DAILY_REPLY_CEILING = 100;

/** Senders the mailbox must never answer automatically. */
export function isNoReplyAddress(address: string) {
  const normalized = address.toLowerCase();
  return (
    /\b(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce)\b/.test(normalized)
  );
}

/** Extract the bare address from a `Name <address>` header value. */
export function parseAddress(headerValue: string) {
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim().toLowerCase();
}

/**
 * The RFC 2822 reply Gmail's send endpoint expects, base64url encoded.
 * Threading is the point (decision 3 of the plan): In-Reply-To and
 * References are what make the reply sit under the original in every mail
 * client, including the inbox a colleague opens.
 */
export function buildReplyMime(args: {
  to: string;
  from: string;
  subject: string;
  inReplyTo?: string;
  references?: string;
  body: string;
}) {
  const subject = args.subject.toLowerCase().startsWith("re:") ? args.subject : `Re: ${args.subject}`;
  const headers = [
    `To: ${args.to}`,
    `From: ${args.from}`,
    `Subject: ${subject}`,
    ...(args.inReplyTo ? [`In-Reply-To: ${args.inReplyTo}`] : []),
    ...(args.references ? [`References: ${args.references}`] : []),
    `Content-Type: multipart/alternative; boundary="${ALTERNATIVE_BOUNDARY}"`,
    "MIME-Version: 1.0",
  ];
  // Base64 on purpose: without a declared transfer encoding, the mail
  // transport is free to hard-wrap long lines itself. An encoded body cannot
  // be rewrapped in transit, and non-ASCII (a £ sign in a price) survives.
  const encodedPart = (mimeType: string, content: string) =>
    [
      `--${ALTERNATIVE_BOUNDARY}`,
      `Content-Type: ${mimeType}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64EncodeBytes(new TextEncoder().encode(content)).replace(/(.{76})/g, "$1\r\n"),
    ].join("\r\n");
  // Two bodies, one message. Sealed transit alone proved not enough: a
  // plain-text-only mail reached Outlook intact and was still shown chopped
  // at ~70 columns, because Exchange re-wraps bare plain text as it pleases.
  // The HTML part is the one every rich client actually displays — it wraps
  // to the reading window. The plain part stays for text-only readers,
  // word for word the same.
  const message =
    `${headers.join("\r\n")}\r\n\r\n` +
    `${encodedPart("text/plain", args.body)}\r\n` +
    `${encodedPart("text/html", renderBodyHtml(args.body))}\r\n` +
    `--${ALTERNATIVE_BOUNDARY}--`;
  return base64UrlEncode(message);
}

/**
 * The boundary between the alternative bodies. A constant is safe: both
 * parts travel base64-encoded, and no base64 line can ever begin with the
 * "--" that marks a boundary.
 */
const ALTERNATIVE_BOUNDARY = "=_hakken_alternative";

/** &, <, > and " made harmless before prose is placed into HTML. */
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The HTML twin of the plain-text body: paragraphs stay paragraphs, single
 * newlines (the sign-off, the quoted trail) stay line breaks, and nothing
 * else is invented — the same words, marked up just enough for a rich
 * client to wrap them to its own window.
 */
export function renderBodyHtml(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`);
  return `<div>${paragraphs.join("\n")}</div>`;
}

function base64EncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

type GmailHeader = { name?: string; value?: string };

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Walk a Gmail payload for its plain-text body, first match wins. */
export function extractPlainTextBody(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
}): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const found = extractPlainTextBody(part as Parameters<typeof extractPlainTextBody>[0]);
    if (found) return found;
  }
  return "";
}

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw appError("UPSTREAM_FAILURE", `Gmail request failed (${response.status}): ${detail}`);
  }
  return await response.json();
}

/** Resolve which installed Gmail connector a tool call means. */
export const resolveGmailConnector = internalQuery({
  args: {
    connectorId: v.optional(v.id("toolConnectors")),
    toolId: v.optional(v.id("aiTools")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<Doc<"toolConnectors"> | null> => {
    if (args.connectorId) {
      return await ctx.db.get(args.connectorId);
    }
    if (args.toolId) {
      const tool = await ctx.db.get(args.toolId);
      if (tool?.connectorId) {
        const connector = await ctx.db.get(tool.connectorId);
        if (connector) return connector;
      }
    }
    if (args.companyId) {
      // Bounded: a workspace installs connectors by hand, in single figures.
      const connectors = await ctx.db
        .query("toolConnectors")
        .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
        .take(100);
      const gmail = connectors.find(
        (connector) => connector.key === "google-gmail" && connector.installStatus === "INSTALLED"
      );
      if (gmail) return gmail;
    }
    return null;
  },
});

/**
 * Read the connected mailbox: recent inbox messages, one message in full, or
 * a whole conversation.
 */
export const readMailbox = internalAction({
  args: {
    connectorId: v.optional(v.id("toolConnectors")),
    toolId: v.optional(v.id("aiTools")),
    companyId: v.optional(v.id("companies")),
    messageId: v.optional(v.string()),
    /**
     * A Gmail thread id: returns every message in the conversation, oldest
     * first, so a follow-up can be understood — and searched for — in the
     * light of what the conversation is actually about.
     */
    threadId: v.optional(v.string()),
    /** A Gmail search query, for the watcher; defaults to unprocessed inbox mail. */
    query: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const connector = await ctx.runQuery(internal.gmailConnector.resolveGmailConnector, {
      connectorId: args.connectorId,
      toolId: args.toolId,
      companyId: args.companyId,
    });
    if (!connector) return { ok: false, error: "No Gmail mailbox is installed for this workspace." };

    const token = await ctx.runAction(internal.connectorOAuth.getConnectorAccessToken, {
      connectorId: connector._id,
    });
    if (!token.ok) return { ok: false, error: token.error };

    if (args.threadId) {
      const thread = (await gmailFetch(
        token.accessToken,
        `/threads/${encodeURIComponent(args.threadId)}?format=full`
      )) as {
        messages?: Array<{
          id: string;
          labelIds?: string[];
          payload?: { headers?: GmailHeader[] } & Parameters<typeof extractPlainTextBody>[0];
        }>;
      };
      const mailboxAddress = (connector.authAccountRef ?? "").toLowerCase();
      const messages = (thread.messages ?? []).map((message) => {
        const from = headerValue(message.payload?.headers, "From");
        return {
          id: message.id,
          from,
          date: headerValue(message.payload?.headers, "Date"),
          fromMailbox:
            message.labelIds?.includes("SENT") || parseAddress(from) === mailboxAddress,
          body: extractPlainTextBody(message.payload ?? {}).slice(0, 8000),
        };
      });
      return { ok: true, messages };
    }

    if (args.messageId) {
      const message = (await gmailFetch(
        token.accessToken,
        `/messages/${encodeURIComponent(args.messageId)}?format=full`
      )) as {
        id: string;
        threadId: string;
        payload?: { headers?: GmailHeader[] } & Parameters<typeof extractPlainTextBody>[0];
      };
      const headers = message.payload?.headers;
      return {
        ok: true,
        message: {
          id: message.id,
          threadId: message.threadId,
          from: headerValue(headers, "From"),
          subject: headerValue(headers, "Subject"),
          date: headerValue(headers, "Date"),
          messageIdHeader: headerValue(headers, "Message-ID"),
          body: extractPlainTextBody(message.payload ?? {}).slice(0, 20000),
        },
      };
    }

    const query = args.query ?? "in:inbox";
    const list = (await gmailFetch(
      token.accessToken,
      `/messages?maxResults=20&q=${encodeURIComponent(query)}`
    )) as { messages?: Array<{ id: string; threadId: string }> };

    const summaries = [];
    for (const item of list.messages ?? []) {
      const message = (await gmailFetch(
        token.accessToken,
        `/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe`
      )) as { id: string; threadId: string; labelIds?: string[]; payload?: { headers?: GmailHeader[] } };
      summaries.push({
        id: message.id,
        threadId: message.threadId,
        labels: message.labelIds ?? [],
        from: headerValue(message.payload?.headers, "From"),
        subject: headerValue(message.payload?.headers, "Subject"),
        date: headerValue(message.payload?.headers, "Date"),
        // Bulk mail declares itself here; the watcher's skip rules read it.
        listUnsubscribe: headerValue(message.payload?.headers, "List-Unsubscribe"),
      });
    }
    return { ok: true, messages: summaries };
  },
});

/**
 * Reply to the sender of a received message, inside the rails.
 *
 * The model chooses which message to answer and what to say — never who
 * receives it. Every send is recorded in `mailboxMessages` (the rails'
 * ledger) and audited by subject and counterparty, never body text.
 */
export const replyToMessage = internalAction({
  args: {
    connectorId: v.optional(v.id("toolConnectors")),
    toolId: v.optional(v.id("aiTools")),
    companyId: v.optional(v.id("companies")),
    messageId: v.string(),
    body: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; sent?: boolean; error?: string; note?: string }> => {
    const connector = await ctx.runQuery(internal.gmailConnector.resolveGmailConnector, {
      connectorId: args.connectorId,
      toolId: args.toolId,
      companyId: args.companyId,
    });
    if (!connector) return { ok: false, error: "No Gmail mailbox is installed for this workspace." };

    const token = await ctx.runAction(internal.connectorOAuth.getConnectorAccessToken, {
      connectorId: connector._id,
    });
    if (!token.ok) return { ok: false, error: token.error };

    // The original message is the source of truth for who gets the reply —
    // and, quoted underneath, for what the reply is answering, so the mail
    // reads as part of its conversation in any client.
    const original = (await gmailFetch(
      token.accessToken,
      `/messages/${encodeURIComponent(args.messageId)}?format=full`
    )) as {
      id: string;
      threadId: string;
      labelIds?: string[];
      payload?: { headers?: GmailHeader[] } & Parameters<typeof extractPlainTextBody>[0];
    };

    const headers = original.payload?.headers;
    const fromHeader = headerValue(headers, "From");
    const senderAddress = parseAddress(headerValue(headers, "Reply-To") || fromHeader);
    const subject = headerValue(headers, "Subject") || "(no subject)";

    // Rail: the mailbox answers mail it received, never its own sent mail.
    if (original.labelIds?.includes("SENT")) {
      return { ok: false, error: "That message was sent by the mailbox itself; there is nobody to reply to." };
    }
    // Rail: never answer a machine.
    if (isNoReplyAddress(senderAddress)) {
      return { ok: false, error: `The sender (${senderAddress}) is a no-reply address; a reply would go nowhere.` };
    }

    const rails = await ctx.runQuery(internal.gmailConnector.checkReplyRails, {
      connectorId: connector._id,
      gmailThreadId: original.threadId,
    });
    if (!rails.ok) {
      // Commitment 6: a rail breach becomes a task, not silence.
      const assignee = connector.companyId
        ? await ctx.runQuery(internal.telephony.findCallAssignee, { companyId: connector.companyId })
        : null;
      if (connector.companyId) {
        const platformName = (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName;
        await ctx.runMutation(internal.tasks.createTaskInternal, {
          companyId: connector.companyId,
          title: `Mailbox: reply needed to "${subject.slice(0, 120)}"`,
          detail:
            `${platformName} wanted to reply to ${senderAddress} but held back: ${rails.reason}\n\n` +
            `Open the mailbox to answer them yourself.`,
          ...(assignee ? { assigneeUserId: assignee } : {}),
          createdBySource: "AGENT" as const,
        });
      }
      return { ok: false, error: `${rails.reason} A task has been raised for a person to reply instead.` };
    }

    const profile = (await gmailFetch(token.accessToken, "/profile")) as { emailAddress?: string };
    const messageIdHeader = headerValue(headers, "Message-ID");
    const references = [headerValue(headers, "References"), messageIdHeader]
      .filter(Boolean)
      .join(" ");

    // The quoted trail: what every hand-written reply carries, and what makes
    // the mail legible as a conversation even in a client that lists each
    // message on its own.
    const originalBody = extractPlainTextBody(original.payload ?? {}).slice(0, 3000);
    const originalDate = headerValue(headers, "Date");
    const quotedTrail = originalBody
      ? `\n\nOn ${originalDate}, ${fromHeader} wrote:\n` +
        originalBody
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : "";

    const raw = buildReplyMime({
      to: senderAddress,
      from: profile.emailAddress ?? connector.authAccountRef ?? "",
      subject,
      inReplyTo: messageIdHeader || undefined,
      references: references || undefined,
      body: `${args.body}${quotedTrail}`,
    });

    await gmailFetch(token.accessToken, "/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw, threadId: original.threadId }),
    });

    await ctx.runMutation(internal.gmailConnector.recordReply, {
      connectorId: connector._id,
      companyId: connector.companyId,
      gmailMessageId: original.id,
      gmailThreadId: original.threadId,
      sender: senderAddress,
      subject,
      actorId: args.userId,
    });

    return { ok: true, sent: true, note: `Replied to ${senderAddress} in their thread.` };
  },
});

/**
 * Put the processed label on a handled message, creating the label the
 * first time a mailbox needs it. What a colleague sees in Gmail is a tag on
 * exactly the mail the agent dealt with.
 */
export const applyProcessedLabel = internalAction({
  args: {
    connectorId: v.id("toolConnectors"),
    messageId: v.string(),
    labelName: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const token: { ok: true; accessToken: string } | { ok: false; error: string } =
      await ctx.runAction(internal.connectorOAuth.getConnectorAccessToken, {
        connectorId: args.connectorId,
      });
    if (!token.ok) return { ok: false, error: token.error };

    const labels = (await gmailFetch(token.accessToken, "/labels")) as {
      labels?: Array<{ id: string; name: string }>;
    };
    let labelId = labels.labels?.find((label) => label.name === args.labelName)?.id;
    if (!labelId) {
      const created = (await gmailFetch(token.accessToken, "/labels", {
        method: "POST",
        body: JSON.stringify({
          name: args.labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      })) as { id: string };
      labelId = created.id;
    }

    await gmailFetch(token.accessToken, `/messages/${encodeURIComponent(args.messageId)}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds: [labelId] }),
    });
    return { ok: true };
  },
});

/** The two counting rails, in one read. */
export const checkReplyRails = internalQuery({
  args: {
    connectorId: v.id("toolConnectors"),
    gmailThreadId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const now = Date.now();

    const secondsAgo = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_thread_replied", (q) =>
        q.eq("gmailThreadId", args.gmailThreadId).gt("repliedAt", now - THREAD_REPLY_MIN_GAP_MS)
      )
      .first();
    if (secondsAgo) {
      return {
        ok: false,
        reason: "This conversation was answered automatically only moments ago.",
      };
    }

    const threadDayCount = (
      await ctx.db
        .query("mailboxMessages")
        .withIndex("by_thread_replied", (q) =>
          q.eq("gmailThreadId", args.gmailThreadId).gt("repliedAt", now - 24 * 60 * 60 * 1000)
        )
        .take(THREAD_DAILY_REPLY_CAP + 1)
    ).length;
    if (threadDayCount >= THREAD_DAILY_REPLY_CAP) {
      return {
        ok: false,
        reason: `This conversation has had its ${THREAD_DAILY_REPLY_CAP} automatic replies for the day.`,
      };
    }

    const dayCount = (
      await ctx.db
        .query("mailboxMessages")
        .withIndex("by_connector_replied", (q) =>
          q.eq("connectorId", args.connectorId).gt("repliedAt", now - 24 * 60 * 60 * 1000)
        )
        .take(DAILY_REPLY_CEILING + 1)
    ).length;
    if (dayCount >= DAILY_REPLY_CEILING) {
      return {
        ok: false,
        reason: `The mailbox has reached its ${DAILY_REPLY_CEILING}-replies-per-day ceiling.`,
      };
    }

    return { ok: true };
  },
});

export const recordReply = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    companyId: v.optional(v.id("companies")),
    gmailMessageId: v.string(),
    gmailThreadId: v.string(),
    sender: v.string(),
    subject: v.string(),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_connector_message", (q) =>
        q.eq("connectorId", args.connectorId).eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { decision: "REPLIED", repliedAt: now, updatedAt: now });
    } else {
      await ctx.db.insert("mailboxMessages", {
        companyId: args.companyId,
        connectorId: args.connectorId,
        gmailMessageId: args.gmailMessageId,
        gmailThreadId: args.gmailThreadId,
        sender: args.sender,
        subject: args.subject,
        decision: "REPLIED",
        repliedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Audited by subject and counterparty, never body text (commitment 5).
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actionType: "MAILBOX_REPLY_SENT",
      entityId: args.connectorId.toString(),
      entityType: "toolConnectors",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ to: args.sender, subject: args.subject.slice(0, 200) }),
    });
  },
});
