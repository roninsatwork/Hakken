import { requestProviderJson } from "./providerHttpService";
import type { ProviderFetch } from "./providerHttpService";
import type { ProviderRetryPolicy } from "./aiProviderRetryService";

export type ResendEmailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
};

export type ResendEmailResponse = {
  id?: string;
};

export async function sendResendEmail(args: {
  apiKey: string;
  operation: string;
  payload: ResendEmailPayload;
  idempotencyKey?: string;
  fetchImpl?: ProviderFetch;
  retryPolicy?: Partial<ProviderRetryPolicy>;
}) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };

  if (args.idempotencyKey) {
    headers["Idempotency-Key"] = args.idempotencyKey;
  }

  return await requestProviderJson({
    providerKey: "resend",
    providerName: "Resend",
    operation: args.operation,
    fetchImpl: args.fetchImpl ?? fetch,
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(args.payload),
    },
    retryPolicy: {
      maxAttempts: 3,
      maxDelayMs: 15000,
      ...args.retryPolicy,
    },
  }) as ResendEmailResponse | null;
}
