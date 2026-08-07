/**
 * Which OAuth providers this deployment can actually sign someone into.
 *
 * The provider list in `auth.ts` and the buttons on the login screen have to
 * agree, and neither can see the other: one runs on the Convex server where
 * the credentials live, the other in the browser where they must never go.
 * This module is the single description both read — the server uses it to
 * decide which providers to construct, and a public query tells the login
 * screen which buttons to draw.
 *
 * A provider is enabled by the presence of its credentials and nothing else.
 * That is deliberate template behaviour: a bespoke deployment turns Microsoft
 * on by setting two environment variables in the Convex dashboard, without a
 * code change or a redeploy of the app. No flag exists to show a button whose
 * sign-in cannot succeed.
 *
 * Google is the exception with history: it predates this module, its button
 * is drawn unconditionally, and its credentials are assumed. It is listed
 * here so the directory is complete, but marked always-on rather than gated —
 * hiding a button that every existing deployment relies on is not this
 * module's call to make.
 */

export type OAuthProviderId = "google" | "microsoft-entra-id" | "linkedin";

export type OAuthProviderDescriptor = {
  id: OAuthProviderId;
  /** Shown on the sign-in button, after "Continue with". */
  label: string;
  /** The environment variables whose presence enables the provider. */
  envId: string;
  envSecret: string;
  /** True for the provider that predates gating and is never hidden. */
  alwaysOn?: boolean;
};

export const OAUTH_PROVIDERS: OAuthProviderDescriptor[] = [
  {
    id: "google",
    label: "Google",
    envId: "AUTH_GOOGLE_ID",
    envSecret: "AUTH_GOOGLE_SECRET",
    alwaysOn: true,
  },
  {
    id: "microsoft-entra-id",
    label: "Microsoft",
    envId: "AUTH_MICROSOFT_ENTRA_ID_ID",
    envSecret: "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    envId: "AUTH_LINKEDIN_ID",
    envSecret: "AUTH_LINKEDIN_SECRET",
  },
];

type EnvLike = Record<string, string | undefined>;

function hasCredentials(descriptor: OAuthProviderDescriptor, env: EnvLike): boolean {
  return Boolean(env[descriptor.envId]?.trim() && env[descriptor.envSecret]?.trim());
}

/**
 * The providers whose sign-in would succeed, in the order buttons should
 * appear. Both credentials must be present — half a configuration draws no
 * button, because the failure it produces lands on the person signing in.
 */
export function enabledOAuthProviders(env: EnvLike): OAuthProviderDescriptor[] {
  return OAUTH_PROVIDERS.filter(
    (descriptor) => descriptor.alwaysOn || hasCredentials(descriptor, env)
  );
}

/** The gated subset that `auth.ts` should construct — everything but the always-on legacy. */
export function gatedOAuthProviders(env: EnvLike): OAuthProviderDescriptor[] {
  return OAUTH_PROVIDERS.filter((descriptor) => !descriptor.alwaysOn && hasCredentials(descriptor, env));
}
