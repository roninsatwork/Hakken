import { describe, expect, test, vi } from "vitest";
import { sendResendEmail } from "./resendEmailService";

const emailPayload = {
  from: "Sonae <noreply@example.com>",
  to: "user@example.com",
  subject: "Invite",
  html: "<p>Hello</p>",
};

describe("resend email service", () => {
  test("retries throttled sends and preserves idempotency key", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: "rate limited" },
      }), {
        status: 429,
        headers: { "Retry-After": "2" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));

    await expect(sendResendEmail({
      apiKey: "test-key",
      operation: "dispatchInviteEmail",
      idempotencyKey: "invite:token-123",
      payload: emailPayload,
      fetchImpl: fetchMock,
      retryPolicy: { sleep, jitterRatio: 0 },
    })).resolves.toEqual({ id: "email_123" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json",
        "Idempotency-Key": "invite:token-123",
      },
    });
  });

  test("does not retry permanent Resend rejections", async () => {
    const fetchMock = vi
      .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(JSON.stringify({
        error: { message: "invalid api key" },
      }), { status: 401 }));

    await expect(sendResendEmail({
      apiKey: "bad-key",
      operation: "workflowEmailNode",
      payload: emailPayload,
      fetchImpl: fetchMock,
      retryPolicy: { sleep: vi.fn(async () => undefined) },
    })).rejects.toMatchObject({
      status: 401,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
