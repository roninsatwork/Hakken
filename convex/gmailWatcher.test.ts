import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";

/**
 * The mailbox that answers itself, with Gmail and the model both stubbed at
 * their boundaries. What is under test is the decision discipline: grounded
 * answers go out threaded, everything else becomes a task with a holding
 * reply, the skip rules are fail-closed, and no message is ever answered
 * twice however many times the poll sees it.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

// Knowledge retrieval answers empty without touching an embedding model; the
// decision under test is the watcher's, not retrieval's.
vi.mock("./knowledgeRetrieval", () => ({
  embedRetrievalQuery: vi.fn(async () => null),
  searchKnowledgeScope: vi.fn(async () => []),
}));

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");

type StubMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  headers: Record<string, string>;
  body?: string;
};

function stubGmail(messages: StubMessage[]) {
  const sends: Array<{ raw: string; threadId?: string }> = [];
  const labelled: string[] = [];
  const byId = new Map(messages.map((message) => [message.id, message]));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/messages/send")) {
        sends.push(JSON.parse(String(init?.body ?? "{}")));
        return Response.json({ id: `sent-${sends.length}` });
      }
      const threadMatch = url.match(/\/threads\/([^/?]+)/);
      if (threadMatch) {
        const threadId = decodeURIComponent(threadMatch[1]);
        const inThread = messages.filter((message) => message.threadId === threadId);
        return Response.json({
          messages: inThread.map((message) => ({
            id: message.id,
            labelIds: message.labelIds ?? ["INBOX"],
            payload: {
              mimeType: "text/plain",
              headers: Object.entries(message.headers).map(([name, value]) => ({ name, value })),
              body: { data: Buffer.from(message.body ?? "").toString("base64url") },
            },
          })),
        });
      }
      if (url.includes("/labels") && init?.method === "POST") {
        return Response.json({ id: "label-sonae" });
      }
      if (url.endsWith("/labels")) {
        return Response.json({ labels: [] });
      }
      const modifyMatch = url.match(/\/messages\/([^/?]+)\/modify/);
      if (modifyMatch) {
        labelled.push(decodeURIComponent(modifyMatch[1]));
        return Response.json({});
      }
      if (url.endsWith("/profile")) {
        return Response.json({ emailAddress: "ask@ronins.co.uk" });
      }
      const messageMatch = url.match(/\/messages\/([^/?]+)/);
      if (messageMatch) {
        const message = byId.get(decodeURIComponent(messageMatch[1]));
        if (!message) return new Response("not found", { status: 404 });
        const headers = Object.entries(message.headers).map(([name, value]) => ({ name, value }));
        if (url.includes("format=full")) {
          return Response.json({
            id: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds ?? ["INBOX"],
            payload: {
              mimeType: "text/plain",
              headers,
              body: { data: Buffer.from(message.body ?? "").toString("base64url") },
            },
          });
        }
        return Response.json({
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds ?? ["INBOX"],
          payload: { headers },
        });
      }
      if (url.includes("/messages?")) {
        return Response.json({
          messages: messages.map((message) => ({ id: message.id, threadId: message.threadId })),
        });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    })
  );
  return { sends, labelled };
}

async function seedMailbox(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Mail Co", createdAt: Date.now() });
    const adminId = await ctx.db.insert("users", {
      email: "owner@mailco.test",
      role: "ADMIN",
      companyId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("aiModels", {
      modelId: "test-model",
      providerKey: "google",
      providerModelId: "test-provider-model",
      displayName: "Test Model",
      isEnabled: true,
      isDefault: true,
      lastSyncedAt: Date.now(),
    });
    return { companyId, adminId };
  });
  const superAdminId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" })
  );
  const connectorId = await t
    .withIdentity({ subject: superAdminId })
    .mutation(api.aiTools.installConnector, { key: "google-gmail", companyId: ids.companyId });
  const accessTokenCiphertext = await encryptConnectorToken("ya29.mailbox-token");
  await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("toolConnectorOAuthConnections", {
      connectorId,
      key: "google-gmail",
      companyId: ids.companyId,
      provider: "google",
      status: "CONNECTED",
      state: "used",
      authorizationUrl: "",
      scopes: [],
      accountRef: "ask@ronins.co.uk",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("connectorOAuthTokens", {
      connectionId,
      connectorId,
      companyId: ids.companyId,
      provider: "google",
      accessTokenCiphertext,
      expiresAt: Date.now() + 3600_000,
      scopes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(connectorId, {
      authConnectionStatus: "CONNECTED",
      authAccountRef: "ask@ronins.co.uk",
    });
  });
  return { ...ids, connectorId };
}

const QUESTION: StubMessage = {
  id: "q-1",
  threadId: "thread-q1",
  headers: {
    From: "Priya Shah <priya@customer.co.uk>",
    Subject: "Opening hours?",
    "Message-ID": "<q1@customer.co.uk>",
  },
  body: "Hi — what are your opening hours?",
};

describe("the mailbox that answers itself", () => {
  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "client-secret");
    generateMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("a grounded answer goes out in the sender's thread and the mail is labelled", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    const { sends, labelled } = stubGmail([QUESTION]);
    generateMock.mockResolvedValue({
      text: '{"reply": "We are open 9 to 5, Monday to Friday.", "needsHuman": false}',
    });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(1);
    expect(sends[0].threadId).toBe("thread-q1");
    expect(labelled).toContain("q-1");

    const rows = await t.run(async (ctx) => await ctx.db.query("mailboxMessages").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ decision: "REPLIED", gmailMessageId: "q-1" });

    // No task for a question the knowledge answered.
    const tasks = await t.run(async (ctx) => await ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(0);
  });

  test("a question needing a person still gets a written reply, plus the task and bell", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { adminId } = await seedMailbox(t);
    const { sends } = stubGmail([QUESTION]);
    // The model now writes the acknowledgement itself — published facts
    // included — rather than the sender getting a canned brush-off.
    generateMock.mockResolvedValue({
      text: '{"reply": "Projects like this usually land between £15,000 and £60,000 — a colleague will follow up with specifics.", "needsHuman": true}',
    });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    // The sender heard the useful part straight away...
    expect(sends).toHaveLength(1);
    const holding = Buffer.from(sends[0].raw, "base64url").toString();
    expect(holding).toContain("colleague will follow up");

    // ...and a person owns the answer, with the bell rung.
    const { rows, tasks, notifications } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      tasks: await ctx.db.query("tasks").collect(),
      notifications: await ctx.db.query("notifications").collect(),
    }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain("priya@customer.co.uk");
    expect(tasks[0].assigneeUserId).toBe(adminId);
    expect(notifications.some((n) => n.kind === "TASK_ASSIGNED" && n.userId === adminId)).toBe(true);
    expect(rows[0]).toMatchObject({ decision: "TASK", taskId: tasks[0]._id });
  });

  test("a model answer that is not valid JSON routes to a person, fail-closed, with the fallback note", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    const { sends } = stubGmail([QUESTION]);
    generateMock.mockResolvedValue({ text: "Certainly! The opening hours are 9 to 5." });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    // The sender still hears something rather than silence.
    expect(sends).toHaveLength(1);
    const fallback = Buffer.from(sends[0].raw, "base64url").toString();
    expect(fallback).toContain("colleague will come back");

    const { rows, tasks } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      tasks: await ctx.db.query("tasks").collect(),
    }));
    expect(rows[0].decision).toBe("TASK");
    expect(tasks).toHaveLength(1);
  });

  test("every skip rule holds: spam, promotions, bulk, no-reply, and the mailbox's own mail", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    const { sends } = stubGmail([
      { id: "s-1", threadId: "t1", labelIds: ["INBOX", "SPAM"], headers: { From: "x@spam.com", Subject: "Win big" } },
      { id: "s-2", threadId: "t2", labelIds: ["INBOX", "CATEGORY_PROMOTIONS"], headers: { From: "deals@shop.com", Subject: "Sale" } },
      { id: "s-3", threadId: "t3", labelIds: ["INBOX"], headers: { From: "news@list.com", Subject: "Digest", "List-Unsubscribe": "<mailto:u@list.com>" } },
      { id: "s-4", threadId: "t4", labelIds: ["INBOX"], headers: { From: "no-reply@bank.com", Subject: "Statement" } },
      { id: "s-5", threadId: "t5", labelIds: ["SENT"], headers: { From: "ask@ronins.co.uk", Subject: "Re: hi" } },
    ]);
    generateMock.mockResolvedValue({ text: '{"reply": "Should never be asked.", "needsHuman": false}' });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
    const rows = await t.run(async (ctx) => await ctx.db.query("mailboxMessages").collect());
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.decision === "SKIPPED")).toBe(true);
  });

  test("double delivery can never answer twice", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    const { sends } = stubGmail([QUESTION]);
    generateMock.mockResolvedValue({
      text: '{"reply": "We are open 9 to 5.", "needsHuman": false}',
    });

    await t.action(internal.gmailWatcher.pollMailboxes, {});
    await t.action(internal.gmailWatcher.pollMailboxes, {});
    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(1);
    const rows = await t.run(async (ctx) => await ctx.db.query("mailboxMessages").collect());
    expect(rows).toHaveLength(1);
  });
});

describe("the dressing every reply wears", () => {
  test("a bare answer gains a greeting by first name, the sign-off, and the AI disclosure", async () => {
    const { dressReply, senderFirstName } = await import("./gmailWatcher");
    const dressed = dressReply({
      body: "Our marketing sites run £8,000 to £30,000.",
      senderFirstName: senderFirstName("Anthony Basker <anthony@ronins.co.uk>"),
      companyName: "Ronins",
    });
    expect(dressed).toMatch(/^Hi Anthony,/);
    expect(dressed).toContain("Thank you for your email.");
    expect(dressed).toContain("Ask Sonae");
    expect(dressed).toContain("Ronins AI assistant");
    // The EU AI Act's transparency duty, guaranteed in code.
    expect(dressed).toContain("written by AI and may contain mistakes");
  });

  test("a reply the model already greeted is not greeted twice, but always signs and discloses", async () => {
    const { dressReply } = await import("./gmailWatcher");
    const dressed = dressReply({
      body: "Hi Priya,\n\nYes — we build ecommerce sites.",
      senderFirstName: "Priya",
      companyName: "Ronins",
    });
    expect(dressed.match(/Hi Priya,/g)).toHaveLength(1);
    expect(dressed).toContain("Ask Sonae");
    expect(dressed).toContain("written by AI");
  });

  test("a bare address yields a plain Hello rather than a mangled name", async () => {
    const { dressReply, senderFirstName } = await import("./gmailWatcher");
    expect(senderFirstName("plain@example.com")).toBeUndefined();
    const dressed = dressReply({ body: "An answer.", companyName: "Ronins" });
    expect(dressed).toMatch(/^Hello,/);
  });
});

describe("full-width paragraphs", () => {
  test("hard-wrapped prose is unwrapped; paragraphs and lists keep their breaks", async () => {
    const { unwrapParagraphs } = await import("./gmailWatcher");
    const wrapped =
      "That certainly helps! Knowing you are a startup building a niche\n" +
      "dating app gives us a clear starting point.\n\n" +
      "Our next steps:\n\n" +
      "- A discovery workshop\n- A fixed-fee build";
    const unwrapped = unwrapParagraphs(wrapped);
    expect(unwrapped).toContain(
      "That certainly helps! Knowing you are a startup building a niche dating app gives us a clear starting point."
    );
    // Paragraph break survives; the list keeps its lines.
    expect(unwrapped).toContain("\n\nOur next steps:");
    expect(unwrapped).toContain("- A discovery workshop\n- A fixed-fee build");
  });
});
