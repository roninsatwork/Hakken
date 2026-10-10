/**
 * One call to a Google API with an access token, and what a refusal means —
 * shared by Search Console (`searchConsoleApi.ts`) and Google Analytics
 * (`googleAnalyticsApi.ts`), so the two read Google's answers the same way
 * (docs/plans/active/google-analytics-plan.md §4.6). No database here.
 */

/**
 * Why Google said no: the token is no good (`EXPIRED` — renew it and ask
 * again), the account cannot read the property (`ACCESS`), Google is busy or
 * failing (`BUSY` — wait and ask again), the question itself was refused
 * (`REFUSED` — a split the kind of result does not have), or Google could not
 * be reached.
 */
export type GoogleFailure = {
  ok: false;
  reason: "EXPIRED" | "ACCESS" | "BUSY" | "REFUSED" | "UNREACHABLE";
  status: number;
  detail: string;
};

async function failureOf(response: Response): Promise<GoogleFailure> {
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  const status = response.status;
  // Google words its quota refusals as 429, and sometimes as a 403 naming the limit.
  const quota = /rate ?limit|quota|exhausted/i.test(detail);
  if (status === 401) return { ok: false, reason: "EXPIRED", status, detail };
  if (status === 429 || status >= 500 || (status === 403 && quota)) return { ok: false, reason: "BUSY", status, detail };
  if (status === 403) return { ok: false, reason: "ACCESS", status, detail };
  return { ok: false, reason: "REFUSED", status, detail };
}

/** GET when there is no body, POST with it as JSON when there is. */
export async function callGoogle(url: string, accessToken: string, body?: unknown): Promise<{ ok: true; json: unknown } | GoogleFailure> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, reason: "UNREACHABLE", status: 0, detail: "Google could not be reached." };
  }
  if (!response.ok) return await failureOf(response);
  return { ok: true, json: await response.json() };
}
