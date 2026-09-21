import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * The auth wiring itself (foundation-quality plan, phase 1.3).
 *
 * The pieces auth.ts composes — provisioning, the consent URL, the code
 * generator, the email shell — carry their own tests. What had none was the
 * composition: which providers exist, what the sign-in emails actually say,
 * that the mailed link is the inert consent URL rather than the framework's
 * self-redeeming one, and that the local-test backdoor cannot exist in
 * production. `convexAuth` is stubbed to capture the config; the providers
 * under test are the real objects auth.ts builds.
 */

const captured = vi.hoisted(() => ({
  config: null as null | {
    providers: Array<Record<string, unknown>>;
    callbacks?: Record<string, unknown>;
  },
}));

// Only `convexAuth` is replaced. Blanking the whole module used to work by
// accident: nothing in this file's import graph reached the package's other
// exports. The first module that did — the schema, pulled in transitively —
// found `authTables` missing and the whole file failed.
vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  convexAuth: (config: never) => {
    captured.config = config;
    return { auth: {}, signIn: {}, signOut: {}, store: {}, isAuthenticated: {} };
  },
}));

const sendResendEmail = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ id: "email-1" })));
vi.mock("./resendEmailService", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendResendEmail,
}));

/** Auth.js provider factories keep the caller's overrides in `.options`. */
function optionOf<T>(provider: Record<string, unknown>, key: string): T {
  const options = provider.options as Record<string, unknown> | undefined;
  return (options?.[key] ?? provider[key]) as T;
}

function providerIds() {
  return (captured.config?.providers ?? []).map((provider) => optionOf<string>(provider, "id"));
}

function findProvider(id: string) {
  const provider = (captured.config?.providers ?? []).find(
    (candidate) => optionOf<string>(candidate, "id") === id
  );
  if (!provider) throw new Error(`No provider with id '${id}' was registered.`);
  return provider;
}

/** Re-evaluate auth.ts under the current env, returning its fresh dependencies. */
async function loadAuth() {
  vi.resetModules();
  captured.config = null;
  sendResendEmail.mockClear();
  await import("./auth");
  const provisioning = await import("./authUserProvisioning");
  const settings = await import("./settingsService");
  const codes = await import("./oneTimeCodeService");
  return { provisioning, settings, codes };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the provider roster", () => {
  test("ships Google, the magic link, and the typed code — and no local-test door by default", async () => {
    vi.stubEnv("LOCAL_TEST_AUTH_ENABLED", "");
    await loadAuth();
    expect(providerIds()).toEqual(["google", "resend", "one-time-code"]);
  });

  test("registers the local-test provider only when enabled outside production", async () => {
    vi.stubEnv("LOCAL_TEST_AUTH_ENABLED", "1");
    vi.stubEnv("LOCAL_TEST_AUTH_ENVIRONMENT", "development");
    await loadAuth();
    expect(providerIds()).toContain("local-test");

    // The same flag in production must not open the door.
    vi.stubEnv("LOCAL_TEST_AUTH_ENVIRONMENT", "production");
    await loadAuth();
    expect(providerIds()).not.toContain("local-test");

    vi.stubEnv("LOCAL_TEST_AUTH_ENABLED", "0");
    vi.stubEnv("LOCAL_TEST_AUTH_ENVIRONMENT", "development");
    await loadAuth();
    expect(providerIds()).not.toContain("local-test");
  });

  test("wires Hakken user provisioning as the createOrUpdateUser callback", async () => {
    const { provisioning } = await loadAuth();
    expect(captured.config?.callbacks?.createOrUpdateUser).toBe(
      provisioning.createOrUpdateHakkenAuthUser
    );
  });
});

describe("the magic-link email", () => {
  test("mails the consent URL, never the framework's self-redeeming link, under the platform's name", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const { settings } = await loadAuth();
    const platformName = settings.DEFAULT_SETTINGS.platformName;

    const send = optionOf<
      (params: {
        identifier: string;
        provider: { from: string };
        url: string;
        expires: Date;
      }) => Promise<void>
    >(findProvider("resend"), "sendVerificationRequest");

    await send({
      identifier: "Person@Example.com",
      provider: { from: `${platformName} <sign-in@example.com>` },
      url: "https://backend.example.com/api/auth/verify?code=secret-code-123&redirectTo=%2Fwiki",
      expires: new Date(Date.now() + 24 * 3600_000),
    });

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    const call = sendResendEmail.mock.calls[0][0] as unknown as {
      apiKey: string;
      operation: string;
      payload: { from: string; to: string; subject: string; html: string; text: string };
    };
    expect(call.apiKey).toBe("re_test_key");
    expect(call.operation).toBe("authMagicLink");
    expect(call.payload.to).toBe("Person@Example.com");
    // The stock template's subject was "Sign in to localhost:3000" — a
    // hostname where the platform's name belongs reads as phishing.
    expect(call.payload.subject).toBe(`Sign in to ${platformName}`);
    expect(call.payload.subject).not.toContain("localhost");
    expect(call.payload.subject).not.toContain("backend.example.com");

    // The consent URL, carrying the renamed parameter and the redirect.
    expect(call.payload.html).toContain("https://app.example.com/verify?c=secret-code-123");
    // Never the framework's URL: a mail gateway that follows links would
    // redeem `code` before the recipient ever saw the email.
    for (const body of [call.payload.html, call.payload.text]) {
      expect(body).not.toContain("code=secret-code-123");
      expect(body).not.toContain("api/auth/verify");
    }
    // The expiry is spelled out in hours, from the real expires value.
    expect(call.payload.text).toContain("24 hours");
  });

  test("simulates the send when no RESEND_API_KEY is configured, rather than throwing", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubEnv("RESEND_API_KEY", "");
    await loadAuth();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const send = optionOf<
      (params: {
        identifier: string;
        provider: { from: string };
        url: string;
        expires: Date;
      }) => Promise<void>
    >(findProvider("resend"), "sendVerificationRequest");

    await send({
      identifier: "person@example.com",
      provider: { from: "X <sign-in@example.com>" },
      url: "https://backend.example.com/api/auth/verify?code=abc",
      expires: new Date(Date.now() + 3600_000),
    });

    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe("the one-time code email", () => {
  test("generates a six-digit numeric code and expires it on the service's clock", async () => {
    const { codes } = await loadAuth();
    const provider = findProvider("one-time-code");

    const generate = optionOf<() => Promise<string>>(provider, "generateVerificationToken");
    const token = await generate();
    expect(token).toMatch(/^\d{6}$/);

    // The framework enforces expiry from maxAge; it must be the service's TTL,
    // not the Email provider's one-hour default.
    expect(optionOf<number>(provider, "maxAge")).toBe(codes.CODE_TTL_MS / 1000);
  });

  test("mails the code to the normalised address, with the code in the body and the expiry in minutes", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const { settings, codes } = await loadAuth();
    const platformName = settings.DEFAULT_SETTINGS.platformName;

    const send = optionOf<
      (params: { identifier: string; provider: { from: string }; token: string }) => Promise<void>
    >(findProvider("one-time-code"), "sendVerificationRequest");

    await send({
      identifier: "  MiXeD@Example.COM ",
      provider: { from: `${platformName} <sign-in@example.com>` },
      token: "654321",
    });

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    const call = sendResendEmail.mock.calls[0][0] as unknown as {
      operation: string;
      payload: { to: string; subject: string; html: string; text: string };
    };
    expect(call.operation).toBe("authOneTimeCode");
    // Typed addresses arrive with stray case and whitespace; the email goes
    // to the normalised form the code tables are keyed on.
    expect(call.payload.to).toBe("mixed@example.com");
    expect(call.payload.subject).toBe(`Your ${platformName} sign-in code`);
    expect(call.payload.html).toContain("654321");
    expect(call.payload.text).toContain("654321");
    expect(call.payload.text).toContain(`${codes.CODE_TTL_MS / 60_000} minutes`);
  });
});

describe("the local-test credentials gate", () => {
  test("refuses unknown roles and non-string secrets without touching the database", async () => {
    vi.stubEnv("LOCAL_TEST_AUTH_ENABLED", "1");
    vi.stubEnv("LOCAL_TEST_AUTH_ENVIRONMENT", "development");
    await loadAuth();
    const authorize = optionOf<
      (credentials: Record<string, unknown>, ctx: { runQuery: ReturnType<typeof vi.fn> }) =>
        Promise<unknown>
    >(findProvider("local-test"), "authorize");

    const runQuery = vi.fn();
    expect(await authorize({ role: "root", secret: "s" }, { runQuery })).toBeNull();
    expect(await authorize({ role: "user", secret: 42 }, { runQuery })).toBeNull();
    expect(await authorize({}, { runQuery })).toBeNull();
    expect(runQuery).not.toHaveBeenCalled();
  });

  test("passes known roles and the shared secret through to the seeded authorize query", async () => {
    vi.stubEnv("LOCAL_TEST_AUTH_ENABLED", "1");
    vi.stubEnv("LOCAL_TEST_AUTH_ENVIRONMENT", "development");
    await loadAuth();
    const authorize = optionOf<
      (credentials: Record<string, unknown>, ctx: { runQuery: ReturnType<typeof vi.fn> }) =>
        Promise<unknown>
    >(findProvider("local-test"), "authorize");

    const runQuery = vi.fn(async () => ({ userId: "user-1" }));
    const result = await authorize({ role: "company-admin", secret: "shh" }, { runQuery });
    expect(result).toEqual({ userId: "user-1" });
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      role: "company-admin",
      secret: "shh",
    });
  });
});
