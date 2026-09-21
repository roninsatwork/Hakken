import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  buildReplyMime,
  decodeBase64Url,
  DAILY_REPLY_CEILING,
  extractPlainTextBody,
  isNoReplyAddress,
  parseAddress,
  renderBodyHtml,
} from "./gmailConnector";

/**
 * The reply rails are the whole safety story of the mailbox (commitment 6):
 * the model chooses what to say, never who hears it, and every refusal turns
 * into a task rather than silence. Gmail itself is stubbed at the network
 * boundary; what is under test is everything the platform decides.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");

function encodeBody(text: string) {
  return Buffer.from(text).toString("base64url");
}

type StubMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  headers: Record<string, string>;
  body?: string;
};

function stubGmailFetch(args: {
  messages: Record<string, StubMessage>;
  onSend?: (payload: { raw: string; threadId?: string }) => void;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/messages/send")) {
        const payload = JSON.parse(String(init?.body ?? "{}"));
        args.onSend?.(payload);
        return Response.json({ id: "sent-1" });
      }
      const messageMatch = url.match(/\/messages\/([^/?]+)/);
      if (messageMatch) {
        const message = args.messages[decodeURIComponent(messageMatch[1])];
        if (!message) return new Response("not found", { status: 404 });
        return Response.json({
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds ?? ["INBOX"],
          payload: {
            mimeType: "text/plain",
            headers: Object.entries(message.headers).map(([name, value]) => ({ name, value })),
            body: { data: Buffer.from(message.body ?? "").toString("base64url") },
          },
        });
      }
      if (url.endsWith("/profile")) {
        return Response.json({ emailAddress: "ask@ronins.co.uk" });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    })
  );
}

async function seedConnectedGmail(t: ReturnType<typeof convexTest>) {
  const superAdminId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" })
  );
  const companyId = await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Mail Co", createdAt: Date.now() })
  );
  const asAdmin = t.withIdentity({ subject: superAdminId });
  const connectorId = await asAdmin.mutation(api.aiTools.installConnector, {
    key: "google-gmail",
    companyId,
  });
  // A connected token row, planted directly: the consent flow has its own
  // tests; these tests start from a working mailbox.
  const { encryptConnectorToken } = await import("./connectorTokenCrypto");
  const accessTokenCiphertext = await encryptConnectorToken("ya29.mailbox-token");
  await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("toolConnectorOAuthConnections", {
      connectorId,
      key: "google-gmail",
      companyId,
      provider: "google",
      status: "CONNECTED",
      state: "used-state",
      authorizationUrl: "",
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      accountRef: "ask@ronins.co.uk",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("connectorOAuthTokens", {
      connectionId,
      connectorId,
      companyId,
      provider: "google",
      accessTokenCiphertext,
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(connectorId, { authConnectionStatus: "CONNECTED", authAccountRef: "ask@ronins.co.uk" });
  });
  return { t, superAdminId, companyId, connectorId };
}


/** Decode a sent MIME: headers as text, each base64 alternative back to text. */
function decodeSentMime(raw: string) {
  const mime = Buffer.from(raw, "base64url").toString();
  const boundary = mime.match(/boundary="([^"]+)"/)?.[1] ?? "";
  const [headerPart] = mime.split("\r\n\r\n");
  const decodePart = (mimeType: string) => {
    const section = mime
      .split(`--${boundary}`)
      .find((part) => part.includes(`Content-Type: ${mimeType}`));
    const encoded = section?.split("\r\n\r\n")[1] ?? "";
    return Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8");
  };
  return { mime, headers: headerPart, body: decodePart("text/plain"), html: decodePart("text/html") };
}

const CUSTOMER_MESSAGE: StubMessage = {
  id: "msg-1",
  threadId: "thread-1",
  labelIds: ["INBOX"],
  headers: {
    From: "Priya Shah <priya@customer.co.uk>",
    Subject: "Opening hours?",
    "Message-ID": "<abc@customer.co.uk>",
    Date: "Thu, 13 Aug 2026 09:00:00 +0000",
  },
  body: "Hi — what are your opening hours?",
};

describe("gmail reply rails", () => {
  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("a reply goes to the sender of the original, threaded, and is recorded and audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, connectorId } = await seedConnectedGmail(t);

    let sent: { raw: string; threadId?: string } | null = null;
    stubGmailFetch({ messages: { "msg-1": CUSTOMER_MESSAGE }, onSend: (payload) => (sent = payload) });

    const result = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "We are open 9 to 5, Monday to Friday.",
    });

    expect(result).toMatchObject({ ok: true, sent: true });
    expect(sent).not.toBeNull();
    const { mime, headers: mimeHeaders, body: mimeBody, html: mimeHtml } = decodeSentMime(sent!.raw);
    // To the sender, in their thread, under their message id — and both
    // bodies encoded, so no mail transport can rewrap them on the way.
    expect(mimeHeaders).toContain("To: priya@customer.co.uk");
    expect(mimeHeaders).toContain("Subject: Re: Opening hours?");
    expect(mimeHeaders).toContain("In-Reply-To: <abc@customer.co.uk>");
    expect(mimeHeaders).toContain("Content-Type: multipart/alternative");
    expect(mime.match(/Content-Transfer-Encoding: base64/g)).toHaveLength(2);
    expect(sent!.threadId).toBe("thread-1");
    // The quoted trail: the reply carries what it answers, so it reads as a
    // conversation in any client, threading support or none.
    expect(mimeBody).toContain("Priya Shah <priya@customer.co.uk> wrote:");
    expect(mimeBody).toContain("> Hi — what are your opening hours?");
    // The HTML twin says the same words, safely escaped.
    expect(mimeHtml).toContain("We are open 9 to 5, Monday to Friday.");
    expect(mimeHtml).toContain("&gt; Hi — what are your opening hours?");

    const { rows, audits } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      audits: await ctx.db.query("auditLogs").collect(),
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ decision: "REPLIED", sender: "priya@customer.co.uk", connectorId });
    const audit = audits.find((entry) => entry.actionType === "MAILBOX_REPLY_SENT");
    expect(audit?.metadata).toContain("Opening hours?");
    // Subject and counterparty only — never the body.
    expect(audit?.metadata).not.toContain("9 to 5");
  });

  test("a no-reply sender is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId } = await seedConnectedGmail(t);
    stubGmailFetch({
      messages: {
        "msg-2": {
          id: "msg-2",
          threadId: "thread-2",
          headers: { From: "Notifications <no-reply@service.com>", Subject: "Your invoice" },
        },
      },
    });

    const result = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-2",
      body: "Thanks!",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no-reply");
  });

  test("the mailbox's own sent mail is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId } = await seedConnectedGmail(t);
    stubGmailFetch({
      messages: {
        "msg-3": {
          id: "msg-3",
          threadId: "thread-3",
          labelIds: ["SENT"],
          headers: { From: "ask@ronins.co.uk", Subject: "Re: Opening hours?" },
        },
      },
    });

    const result = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-3",
      body: "Echo!",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("mailbox itself");
  });

  test("a burst of replies in the same thread is refused, but conversation resumes after the gap", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdminId } = await seedConnectedGmail(t);
    // Give the workspace an admin so the task has an owner.
    await t.run(async (ctx) => {
      await ctx.db.patch(superAdminId, { companyId, role: "ADMIN" });
    });
    stubGmailFetch({ messages: { "msg-1": CUSTOMER_MESSAGE } });

    const first = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "First answer.",
    });
    expect(first.ok).toBe(true);

    // Seconds later: refused — nothing human types that fast — and a person
    // is tasked instead.
    const burst = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "Second answer.",
    });
    expect(burst.ok).toBe(false);
    expect(burst.error).toContain("task has been raised");

    const { tasks, notifications } = await t.run(async (ctx) => ({
      tasks: await ctx.db.query("tasks").collect(),
      notifications: await ctx.db.query("notifications").collect(),
    }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain("Opening hours?");
    expect(tasks[0].assigneeUserId).toBe(superAdminId);
    expect(notifications.some((n) => n.kind === "TASK_ASSIGNED")).toBe(true);

    // Two minutes on, the conversation continues — email is a conversation,
    // and the rail only breaks robot ping-pong, not dialogue.
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("mailboxMessages").collect();
      for (const row of rows) {
        if (row.repliedAt) await ctx.db.patch(row._id, { repliedAt: row.repliedAt - 2 * 60 * 1000 });
      }
    });
    const resumed = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "Happy to expand on that.",
    });
    expect(resumed.ok).toBe(true);
  });

  test("a conversation stops at its daily automatic-reply cap", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, connectorId } = await seedConnectedGmail(t);
    const { THREAD_DAILY_REPLY_CAP } = await import("./gmailConnector");
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < THREAD_DAILY_REPLY_CAP; index += 1) {
        await ctx.db.insert("mailboxMessages", {
          companyId,
          connectorId,
          gmailMessageId: `earlier-${index}`,
          gmailThreadId: "thread-1",
          sender: "priya@customer.co.uk",
          subject: "Opening hours?",
          decision: "REPLIED",
          repliedAt: now - (index + 3) * 60 * 1000,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    stubGmailFetch({ messages: { "msg-1": CUSTOMER_MESSAGE } });

    const result = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "One more?",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("automatic replies for the day");
  });

  test("the per-day ceiling holds even across different threads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, connectorId } = await seedConnectedGmail(t);
    // The ledger already holds a day's worth of replies in other threads.
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < DAILY_REPLY_CEILING; index += 1) {
        await ctx.db.insert("mailboxMessages", {
          companyId,
          connectorId,
          gmailMessageId: `old-${index}`,
          gmailThreadId: `old-thread-${index}`,
          sender: "someone@example.com",
          subject: "Earlier mail",
          decision: "REPLIED",
          repliedAt: now - 60_000,
          createdAt: now - 60_000,
          updatedAt: now - 60_000,
        });
      }
    });
    stubGmailFetch({ messages: { "msg-1": CUSTOMER_MESSAGE } });

    const result = await t.action(internal.gmailConnector.replyToMessage, {
      companyId,
      messageId: "msg-1",
      body: "One more?",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ceiling");
  });
});

describe("gmail plumbing helpers", () => {
  test("no-reply detection catches the common shapes and spares real people", () => {
    for (const address of [
      "no-reply@service.com",
      "noreply@github.com",
      "do-not-reply@bank.co.uk",
      "donotreply@example.com",
      "mailer-daemon@googlemail.com",
      "bounce@lists.example.com",
    ]) {
      expect(isNoReplyAddress(address), address).toBe(true);
    }
    for (const address of ["priya@customer.co.uk", "reply@example.com", "norepublic@example.com"]) {
      expect(isNoReplyAddress(address), address).toBe(false);
    }
  });

  test("addresses parse out of display-name headers", () => {
    expect(parseAddress("Priya Shah <Priya@Customer.co.uk>")).toBe("priya@customer.co.uk");
    expect(parseAddress("plain@example.com")).toBe("plain@example.com");
  });

  test("the reply MIME threads under the original and does not double the Re:", () => {
    const raw = buildReplyMime({
      to: "priya@customer.co.uk",
      from: "ask@ronins.co.uk",
      subject: "Re: Opening hours?",
      inReplyTo: "<abc@customer.co.uk>",
      references: "<earlier@customer.co.uk> <abc@customer.co.uk>",
      body: "We are open 9 to 5.",
    });
    const mime = decodeBase64Url(raw);
    expect(mime).toContain("Subject: Re: Opening hours?");
    expect(mime).not.toContain("Re: Re:");
    expect(mime).toContain("References: <earlier@customer.co.uk> <abc@customer.co.uk>");
  });

  test("the html twin keeps paragraphs and line breaks, and escapes markup", () => {
    expect(renderBodyHtml("Best <deal> & price\n\nAsk Hakken\nAI assistant")).toBe(
      "<div><p>Best &lt;deal&gt; &amp; price</p>\n<p>Ask Hakken<br>AI assistant</p></div>"
    );
  });

  test("plain text is found inside a multipart payload", () => {
    const body = extractPlainTextBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: encodeBody("<p>hello</p>") } },
        { mimeType: "text/plain", body: { data: encodeBody("hello") } },
      ],
    });
    expect(body).toBe("hello");
  });
});
