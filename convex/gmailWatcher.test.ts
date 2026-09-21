import { DEFAULT_SETTINGS } from "./settingsService";
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
        return Response.json({ id: "label-hakken" });
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


/** Decode a sent MIME: headers as text, base64 body decoded back to text. */
function decodeSentMime(raw: string) {
  const mime = Buffer.from(raw, "base64url").toString();
  const boundary = mime.match(/boundary="([^"]+)"/)?.[1] ?? "";
  const [headerPart] = mime.split("\r\n\r\n");
  const section = mime
    .split(`--${boundary}`)
    .find((part) => part.includes("Content-Type: text/plain"));
  const encoded = section?.split("\r\n\r\n")[1] ?? "";
  const body = Buffer.from(encoded.replace(/\s/g, ""), "base64").toString("utf8");
  return { mime, headers: headerPart, body };
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
    const holding = decodeSentMime(sends[0].raw).body;
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
    const fallback = decodeSentMime(sends[0].raw).body;
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
    expect(dressed).toContain(`Ask ${DEFAULT_SETTINGS.platformName}`);
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
    expect(dressed).toContain(`Ask ${DEFAULT_SETTINGS.platformName}`);
    expect(dressed).toContain("written by AI");
  });

  test("a bare address yields a plain Hello rather than a mangled name", async () => {
    const { dressReply, senderFirstName } = await import("./gmailWatcher");
    expect(senderFirstName("plain@example.com")).toBeUndefined();
    const dressed = dressReply({ body: "An answer.", companyName: "Ronins" });
    expect(dressed).toMatch(/^Hello,/);
  });

  test("an Italian reply wears an Italian greeting, thanks, and disclosure", async () => {
    const { dressReply } = await import("./gmailWatcher");
    const dressed = dressReply({
      body: "Costruiamo siti di ecommerce per aziende di ogni dimensione.",
      senderFirstName: "Marco",
      companyName: "Ronins",
      language: "it",
    });
    expect(dressed).toMatch(/^Buongiorno Marco,/);
    expect(dressed).toContain("Grazie per la sua email.");
    expect(dressed).toContain(`Ask ${DEFAULT_SETTINGS.platformName}`);
    expect(dressed).toContain("Ronins Assistente IA");
    // The transparency duty holds in every language, with exact wording.
    expect(dressed).toContain("scritta da un'IA e potrebbe contenere errori");
    expect(dressed).not.toContain("Thank you for your email.");
  });

  test("a model greeting in the sender's language is not greeted twice", async () => {
    const { dressReply } = await import("./gmailWatcher");
    const dressed = dressReply({
      body: "Ciao Marco,\n\nCostruiamo siti di ecommerce.",
      senderFirstName: "Marco",
      companyName: "Ronins",
      language: "it",
    });
    expect(dressed).not.toContain("Buongiorno");
    expect(dressed.match(/Ciao Marco,/g)).toHaveLength(1);
    expect(dressed).toContain("scritta da un'IA");
  });

  test("a language we hold no translation for falls back to English dressing", async () => {
    const { dressReply } = await import("./gmailWatcher");
    const dressed = dressReply({ body: "Svar på svenska.", language: "sv", companyName: "Ronins" });
    expect(dressed).toMatch(/^Hello,/);
    expect(dressed).toContain("written by AI and may contain mistakes");
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

/**
 * The mailbox's Decisions, switched on (decisions-typesafe-plan.md, Phase D).
 *
 * TypeSafe is stubbed at its HTTP boundary like Gmail and the reply model.
 * What is under test is the wiring: a sure "not a customer" leaves the mail
 * alone in the Decision's own words, a sure review overrules the reply
 * model's own opinion, an unsure review hands over, the ask-a-person mode
 * sends nothing, and a dead provider falls back to the rules with the mail
 * still answered.
 */
type TypesafeStubAnswers = Record<string, unknown>;

/** Seed a chosen TypeSafe model for the Decisions job and set each mode. */
async function switchOnDecisions(
  t: ReturnType<typeof convexTest>,
  modes: Record<string, "OFF" | "ASK_A_PERSON" | "ACT">,
) {
  vi.stubEnv("TYPESAFE_API_KEY", "typesafe-test-key");
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("aiProviders", {
      providerKey: "typesafe",
      displayName: "TypeSafe",
      isEnabled: true,
      authMode: "environment",
      status: "healthy",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("aiModels", {
      modelId: "typesafe:jev-latest",
      providerKey: "typesafe",
      providerModelId: "jev-latest",
      displayName: "Jev Latest",
      isEnabled: true,
      isDefault: false,
      capabilities: ["decision"],
      supportedUseCases: ["decision"],
      standardInputCostBelow200k: 1,
      standardInputCostAbove200k: 1,
      outputResponseCost: 2,
      lastSyncedAt: now,
    });
    await ctx.db.insert("aiModelDefaults", {
      scope: "global",
      useCase: "decision",
      providerKey: "typesafe",
      modelId: "typesafe:jev-latest",
      updatedAt: now,
    });
    for (const [decisionKey, mode] of Object.entries(modes)) {
      await ctx.db.insert("decisionSettings", { scope: "global", decisionKey, mode, updatedAt: now });
    }
  });
}

/**
 * Put TypeSafe in front of the Gmail stub: `/v1/systemone` answers from the
 * script (one entry per request, in order), everything else goes to Gmail.
 */
function stubTypesafe(script: Array<TypesafeStubAnswers | { status: number }>) {
  const gmailFetch = globalThis.fetch;
  const requests: Array<{ questions: string[]; state: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("api.typesafe.ai")) return gmailFetch(input, init);
      const body = JSON.parse(String(init?.body ?? "{}")) as { questions: Record<string, unknown>; state: unknown };
      requests.push({ questions: Object.keys(body.questions), state: body.state });
      const next = script.shift();
      if (!next) throw new Error("TypeSafe asked more than the script allows.");
      if ("status" in next && typeof next.status === "number" && Object.keys(next).length === 1) {
        return Response.json({ error: "overloaded" }, { status: next.status });
      }
      return Response.json({ model: "jev-latest", answers: next, usage: { input_tokens: 400, output_tokens: 40 } });
    }),
  );
  return { requests };
}

const choice = (choiceKey: string, probabilities: Record<string, number>, confidence: number) => ({
  type: "choice", choice: choiceKey, probabilities, confidence,
});
const noul = (value: number) => ({ type: "noul", noul: value });

const SPAMMY: StubMessage = {
  id: "sp-1",
  threadId: "thread-sp1",
  headers: { From: "Best Deals <deals@example.net>", Subject: "You have been selected", "Message-ID": "<sp1@example.net>" },
  body: "Congratulations! Claim your prize now.",
};

describe("the mailbox's Decisions, switched on", () => {
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

  test("a sure 'spam' leaves the mail alone in the Decision's own words, priced and audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    await switchOnDecisions(t, { "mailbox.message-kind": "ACT", "mailbox.language": "ACT", "mailbox.urgent": "ACT" });
    const { sends } = stubGmail([SPAMMY]);
    const typesafe = stubTypesafe([
      {
        "mailbox.message-kind": choice("spam", { spam: 0.9, customer: 0.06, newsletter: 0.02, automated: 0.01, other: 0.01 }, 0.84),
        "mailbox.language": choice("english", { english: 0.94, italian: 0.01, french: 0.01, german: 0.01, spanish: 0.01, portuguese: 0.01, other: 0.01 }, 0.93),
        "mailbox.urgent": noul(0.1),
      },
    ]);
    generateMock.mockResolvedValue({ text: '{"reply": "Should never be asked.", "needsHuman": false}' });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
    expect(typesafe.requests).toHaveLength(1);
    expect(typesafe.requests[0].questions).toEqual(["mailbox.message-kind", "mailbox.language", "mailbox.urgent"]);
    expect(typesafe.requests[0].state).toMatchObject({ company: { name: "Mail Co" }, email: { subject: "You have been selected" } });

    const { rows, runs, transactions, audits } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      runs: await ctx.db.query("decisionRuns").collect(),
      transactions: await ctx.db.query("agentTransactions").collect(),
      audits: (await ctx.db.query("auditLogs").collect()).filter((entry) => entry.actionType === "DECISION_ACTED"),
    }));
    expect(rows[0]).toMatchObject({ decision: "SKIPPED", decisionReason: "Skipped the email as spam." });
    expect(runs).toHaveLength(3);
    expect(runs.find((run) => run.decisionKey === "mailbox.message-kind")).toMatchObject({
      answer: "spam", certainty: "SURE", outcome: "ACTED", source: "TYPESAFE", action: "skipped the email as spam", subjectId: "sp-1",
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ providerKey: "typesafe", inputTokens: 400, outputTokens: 40 });
    // 400 in at £1/M + 40 out at £2/M.
    expect(transactions[0].costGBP).toBeCloseTo(0.00048);
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata ?? "{}")).toMatchObject({ decision: "Is this email from a customer?", answer: "spam", certainty: "sure" });
  });

  test("a sure review overrules the reply model: no task, and the reply wears the judged language", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    await switchOnDecisions(t, { "mailbox.message-kind": "ACT", "mailbox.language": "ACT", "mailbox.needs-a-person": "ACT" });
    const { sends } = stubGmail([QUESTION]);
    const typesafe = stubTypesafe([
      {
        "mailbox.message-kind": choice("customer", { customer: 0.95, newsletter: 0.02, automated: 0.01, spam: 0.01, other: 0.01 }, 0.93),
        "mailbox.language": choice("italian", { italian: 0.9, english: 0.05, french: 0.01, german: 0.01, spanish: 0.01, portuguese: 0.01, other: 0.01 }, 0.85),
        "mailbox.urgent": noul(0.2),
      },
      { "mailbox.needs-a-person": noul(0.04) },
    ]);
    // The reply model hedges; the Decision, sure, says no person is needed.
    generateMock.mockResolvedValue({ text: '{"reply": "Siamo aperti dalle 9 alle 17.", "needsHuman": true, "language": "en"}' });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(1);
    expect(decodeSentMime(sends[0].raw).body).toContain("Buongiorno Priya");
    expect(typesafe.requests).toHaveLength(2);
    expect(typesafe.requests[1].questions).toEqual(["mailbox.needs-a-person"]);
    expect(typesafe.requests[1].state).toMatchObject({ reply: { text: "Siamo aperti dalle 9 alle 17." } });

    const { rows, tasks } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      tasks: await ctx.db.query("tasks").collect(),
    }));
    expect(rows[0].decision).toBe("REPLIED");
    expect(tasks).toHaveLength(0);
  });

  test("an unsure review hands over, and a sure 'urgent' makes the task urgent and due today", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    await switchOnDecisions(t, { "mailbox.needs-a-person": "ACT", "mailbox.urgent": "ACT" });
    const { sends } = stubGmail([QUESTION]);
    stubTypesafe([
      { "mailbox.urgent": noul(0.96) },
      { "mailbox.needs-a-person": noul(0.55) },
    ]);
    generateMock.mockResolvedValue({ text: '{"reply": "We are open 9 to 5.", "needsHuman": false}' });
    const before = Date.now();

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(1);
    const { rows, tasks, runs } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      tasks: await ctx.db.query("tasks").collect(),
      runs: await ctx.db.query("decisionRuns").collect(),
    }));
    expect(rows[0].decision).toBe("TASK");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title.startsWith("Urgent: Answer priya@customer.co.uk")).toBe(true);
    expect(tasks[0].dueAt).toBeGreaterThan(before);
    expect(runs.find((run) => run.decisionKey === "mailbox.needs-a-person")).toMatchObject({ certainty: "NOT_SURE", outcome: "HANDED_TO_PERSON" });
    // Off, so its rule answered and TypeSafe was never asked about it.
    expect(runs.find((run) => run.decisionKey === "mailbox.message-kind")).toMatchObject({ source: "RULES", fallbackReason: "MODE_OFF", answer: "customer" });
  });

  test("ask-a-person on message-kind sends nothing and files the question as a task", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { adminId } = await seedMailbox(t);
    await switchOnDecisions(t, { "mailbox.message-kind": "ASK_A_PERSON" });
    const { sends } = stubGmail([SPAMMY]);
    stubTypesafe([{ "mailbox.message-kind": choice("newsletter", { newsletter: 0.8, customer: 0.15, automated: 0.03, spam: 0.01, other: 0.01 }, 0.65) }]);
    generateMock.mockResolvedValue({ text: '{"reply": "Should never be asked.", "needsHuman": false}' });

    await t.action(internal.gmailWatcher.pollMailboxes, {});

    expect(sends).toHaveLength(0);
    expect(generateMock).not.toHaveBeenCalled();
    const { rows, tasks } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      tasks: await ctx.db.query("tasks").collect(),
    }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain("Decide whether to answer deals@example.net");
    expect(tasks[0].assigneeUserId).toBe(adminId);
    expect(rows[0]).toMatchObject({ decision: "TASK", taskId: tasks[0]._id, decisionReason: "A person decides whether to answer this email." });
  });

  test("a dead provider falls back to the rules and the mail is still answered", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedMailbox(t);
    await switchOnDecisions(t, { "mailbox.message-kind": "ACT", "mailbox.needs-a-person": "ACT" });
    const { sends } = stubGmail([QUESTION]);
    // Three attempts per request, two requests: every one overloaded.
    stubTypesafe([{ status: 529 }, { status: 529 }, { status: 529 }, { status: 529 }, { status: 529 }, { status: 529 }]);
    generateMock.mockResolvedValue({ text: '{"reply": "We are open 9 to 5.", "needsHuman": false}' });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await t.action(internal.gmailWatcher.pollMailboxes, {});
    } finally {
      warn.mockRestore();
    }

    expect(sends).toHaveLength(1);
    const { rows, runs, transactions } = await t.run(async (ctx) => ({
      rows: await ctx.db.query("mailboxMessages").collect(),
      runs: await ctx.db.query("decisionRuns").collect(),
      transactions: await ctx.db.query("agentTransactions").collect(),
    }));
    expect(rows[0].decision).toBe("REPLIED");
    expect(runs.every((run) => run.source === "RULES")).toBe(true);
    expect(runs.filter((run) => run.fallbackReason === "PROVIDER_FAILED").map((run) => run.decisionKey).sort())
      .toEqual(["mailbox.message-kind", "mailbox.needs-a-person"]);
    expect(transactions).toHaveLength(0);
  }, 30_000);
});
