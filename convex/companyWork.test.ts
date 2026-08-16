import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Seeing the work (seven-gaps plan, phase 1): an admin can at last read a
 * company's calls and handled mail — masked and body-less exactly as the
 * tenant surfaces are — and the tenant walls hold at the new height.
 */

describe("the admin's view of a company's work", () => {
  test("calls list masks numbers, detail shows them, mailbox lists decisions, walls hold", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { companyId, otherCompanyId, adminId, otherAdminId, callId, connectorId } = await t.run(
      async (ctx) => {
        const companyId = await ctx.db.insert("companies", { name: "Work Corp", createdAt: now });
        const otherCompanyId = await ctx.db.insert("companies", {
          name: "Other Corp",
          createdAt: now,
        });
        const adminId = await ctx.db.insert("users", {
          email: "admin@work.test",
          role: "ADMIN",
          companyId,
        });
        const otherAdminId = await ctx.db.insert("users", {
          email: "admin@other.test",
          role: "ADMIN",
          companyId: otherCompanyId,
        });
        const callId = await ctx.db.insert("phoneCalls", {
          companyId,
          providerCallId: "CA-test-1",
          fromNumber: "+447700900123",
          toNumber: "+441234567890",
          status: "COMPLETED",
          turns: [
            { role: "CALLER", text: "Are you open on Saturdays?", at: now - 60_000 },
            { role: "SONAE", text: "We are, nine until one.", at: now - 55_000 },
          ],
          summary: "Asked about Saturday opening.",
          startedAt: now - 90_000,
          endedAt: now - 30_000,
        });
        const connectorId = await ctx.db.insert("toolConnectors", {
          key: "google-gmail",
          name: "Gmail",
          description: "The connected inbox",
          category: "EMAIL",
          authMode: "OAUTH",
          tenantAvailability: "TENANT_RESTRICTED",
          companyId,
          installStatus: "INSTALLED",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("mailboxMessages", {
          companyId,
          connectorId,
          gmailMessageId: "m-1",
          gmailThreadId: "t-1",
          sender: "customer@example.com",
          subject: "Quote for a garden wall",
          decision: "REPLIED",
          repliedAt: now - 10_000,
          createdAt: now - 20_000,
          updatedAt: now - 10_000,
        });
        return { companyId, otherCompanyId, adminId, otherAdminId, callId, connectorId };
      }
    );

    const asAdmin = t.withIdentity({ subject: adminId });

    // The list wears the mask; the detail carries the whole number.
    const calls = await asAdmin.query(api.telephony.listCallsForCompany, { companyId });
    expect(calls).toHaveLength(1);
    expect(calls[0].fromMasked).not.toContain("900123");
    expect(calls[0].summary).toBe("Asked about Saturday opening.");
    const call = await asAdmin.query(api.telephony.getCallForCompany, {
      companyId,
      callId: callId,
    });
    expect(call?.fromNumber).toBe("+447700900123");
    expect(call?.turns).toHaveLength(2);

    // A garbled address-bar id reads as not-found, never as an error.
    await expect(
      asAdmin.query(api.telephony.getCallForCompany, { companyId, callId: "not-an-id" })
    ).resolves.toBeNull();

    // The mailbox lists sender, subject and decision — nothing more.
    const mail = await asAdmin.query(api.mailbox.listMailboxForCompany, { companyId });
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({
      sender: "customer@example.com",
      subject: "Quote for a garden wall",
      decision: "REPLIED",
    });

    // The walls: another company's admin can read none of it.
    const asOther = t.withIdentity({ subject: otherAdminId });
    await expect(asOther.query(api.telephony.listCallsForCompany, { companyId })).rejects.toThrow();
    await expect(
      asOther.query(api.telephony.getCallForCompany, { companyId, callId })
    ).rejects.toThrow();
    await expect(asOther.query(api.mailbox.listMailboxForCompany, { companyId })).rejects.toThrow();

    // And a call from one company never answers to another's door.
    await expect(
      asOther.query(api.telephony.getCallForCompany, { companyId: otherCompanyId, callId })
    ).resolves.toBeNull();
  });
});
