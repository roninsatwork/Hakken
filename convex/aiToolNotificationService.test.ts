import { describe, expect, test } from "vitest";
import {
  isPlausibleEmailAddress,
  parseRecipients,
  buildAgentNotificationEmail,
  resolveNotificationContent,
  resolveNotificationRecipients,
} from "./aiToolNotificationService";

/**
 * The recipient policy is the security control this connector turns on.
 *
 * An agent's instructions come partly from retrieved documents and user
 * messages, both untrusted, so "email this to X" is something an attacker can
 * plant. Prompt hardening reduces the chance of the agent obeying; this is what
 * stops it mattering if it does.
 */

const tenantAddresses = ["alice@acme.test", "bob@acme.test"];

describe("who an agent may notify", () => {
  test("allows people with an account in the same workspace", () => {
    const decision = resolveNotificationRecipients({
      requested: ["alice@acme.test"],
      tenantAddresses,
    });
    expect(decision).toEqual({ allowed: true, recipients: ["alice@acme.test"] });
  });

  test("refuses an address that is not in the workspace", () => {
    // The phishing case: an injected instruction naming an outside address.
    const decision = resolveNotificationRecipients({
      requested: ["attacker@evil.test"],
      tenantAddresses,
    });
    expect(decision.allowed).toBe(false);
  });

  test("refuses the whole send when one recipient is outside", () => {
    // Not a partial send. Dropping the disallowed address and delivering to the
    // rest would report success while hiding an attempted policy breach, and
    // would tell the agent everyone had been notified.
    const decision = resolveNotificationRecipients({
      requested: ["alice@acme.test", "attacker@evil.test"],
      tenantAddresses,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain("attacker@evil.test");
      expect(decision.reason).not.toContain("alice@acme.test");
    }
  });

  test("matches addresses regardless of case or padding", () => {
    // A policy defeated by capitalisation is not a policy.
    const decision = resolveNotificationRecipients({
      requested: parseRecipients("  ALICE@Acme.test  "),
      tenantAddresses,
    });
    expect(decision.allowed).toBe(true);
  });

  test("refuses when there is nobody to send to", () => {
    expect(resolveNotificationRecipients({ requested: [], tenantAddresses }).allowed).toBe(false);
  });

  test("refuses a malformed address rather than handing it to the provider", () => {
    const decision = resolveNotificationRecipients({
      requested: ["not-an-address"],
      tenantAddresses,
    });
    expect(decision.allowed).toBe(false);
  });

  test("caps how many people one notification can reach", () => {
    // An agent that can address the whole workspace in one call is a broadcast
    // tool, which is not what this is for.
    const many = Array.from({ length: 40 }, (_, index) => `user${index}@acme.test`);
    const decision = resolveNotificationRecipients({
      requested: many,
      tenantAddresses: many,
    });
    expect(decision.allowed).toBe(false);
  });

  test("an empty workspace permits nobody", () => {
    // Fails closed: no tenant addresses means no valid recipients, rather than
    // no restriction.
    const decision = resolveNotificationRecipients({
      requested: ["alice@acme.test"],
      tenantAddresses: [],
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("recipient parsing", () => {
  test("splits on commas and semicolons and removes duplicates", () => {
    expect(parseRecipients("a@x.test, b@x.test; a@x.test")).toEqual(["a@x.test", "b@x.test"]);
  });

  test("recognises plausible addresses only", () => {
    expect(isPlausibleEmailAddress("a@x.test")).toBe(true);
    expect(isPlausibleEmailAddress("a@x")).toBe(false);
    expect(isPlausibleEmailAddress("a b@x.test")).toBe(false);
  });
});

describe("notification content", () => {
  test("requires a subject and a body", () => {
    expect(resolveNotificationContent({ subject: "  ", body: "hello" }).ok).toBe(false);
    expect(resolveNotificationContent({ subject: "Hi", body: "   " }).ok).toBe(false);
  });

  test("bounds subject and body length", () => {
    expect(resolveNotificationContent({ subject: "x".repeat(500), body: "b" }).ok).toBe(false);
    expect(resolveNotificationContent({ subject: "s", body: "x".repeat(20000) }).ok).toBe(false);
  });

  test("trims usable content", () => {
    const result = resolveNotificationContent({ subject: "  Hi  ", body: "  Hello  " });
    expect(result).toEqual({ ok: true, subject: "Hi", body: "Hello" });
  });
});

describe("rendering the body", () => {
  function build(body: string) {
    return buildAgentNotificationEmail({ subject: "A notification", body });
  }

  test("escapes model-generated text rather than trusting it as markup", () => {
    // An agent able to emit raw HTML could be induced to emit a link whose text
    // does not match where it goes.
    const { html } = build('<a href="http://evil.test">your bank</a>');
    expect(html).not.toContain('<a href="http://evil.test"');
    expect(html).toContain("&lt;a href");
  });

  test("escapes a hostile subject too", () => {
    const { html } = buildAgentNotificationEmail({
      subject: "<img src=x onerror=alert(1)>",
      body: "Anything.",
    });
    // What makes it inert is the angle brackets being escaped — the attribute
    // text itself survives as plain characters, which is correct.
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("keeps paragraphs and line breaks readable", () => {
    const { html, text } = build("First line\nsecond line\n\nNew paragraph");

    expect(html).toContain("<br />");
    expect(html).toContain("New paragraph");
    expect(text).toContain("New paragraph");
  });

  test("says plainly that an agent sent it and where it could reach", () => {
    const { html, text } = build("Anything.");

    expect(html).toContain("An agent sent this.");
    expect(text).toContain("already in your workspace");
  });

  test("carries the platform name from settings", () => {
    const { html } = buildAgentNotificationEmail(
      { subject: "s", body: "b" },
      { platformName: "Acme Ops" }
    );
    expect(html).toContain("ACME OPS");
  });
});
