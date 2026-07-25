/**
 * Turning a connector's secret *reference* into the value it points at.
 *
 * The connector design has always been right about this: the database stores a
 * pointer — `vault/acme/crm/base_url` — and never the credential, so a leaked
 * row leaks nothing. `connectorSecretPolicy` enforces that discipline at the
 * point an administrator types it.
 *
 * What was missing is the other half. `providerRef` was written and read back by
 * nothing, anywhere, so a connector could be fully "configured" and still have
 * no way to obtain the API address or key it needed. That is why the HTTP
 * connector could not be implemented: not for want of an implementation, but for
 * want of anywhere to look up what it should call.
 *
 * This resolves references from the deployment environment. That is deliberately
 * the modest option: it needs no new dependency, no key management, and no
 * decision about encryption at rest — and because it is read-only it does not
 * foreclose a real secret manager later. OAuth is a different matter and still
 * blocked: it must *write* the tokens it receives, which the environment cannot
 * do.
 */

/**
 * Prefix for every connector secret in the environment.
 *
 * Namespaced so a connector reference can never resolve to an unrelated
 * deployment variable. Without it, a reference called `path` or `home` would
 * read `PATH` or `HOME`, which is both a leak and a very confusing bug.
 */
export const CONNECTOR_SECRET_ENV_PREFIX = "CONNECTOR_SECRET_";

/**
 * The environment variable name a reference maps to.
 *
 * `vault/acme/crm/base_url` becomes `CONNECTOR_SECRET_VAULT_ACME_CRM_BASE_URL`.
 * The mapping is total and case-insensitive so that an administrator who types
 * the reference in a slightly different case still resolves to the same secret,
 * rather than getting a confusing "not configured" for a value they can see.
 */
export function buildConnectorSecretEnvName(providerRef: string) {
  const normalized = providerRef
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${CONNECTOR_SECRET_ENV_PREFIX}${normalized}`;
}

export type ConnectorSecretLookup =
  | { found: true; value: string }
  | { found: false; envName: string };

/**
 * Look up one reference.
 *
 * Returns the *name* it looked for when it fails, never a partial value and
 * never the environment's contents. An operator needs to know which variable to
 * set; nobody needs the near-miss.
 */
export function resolveConnectorSecret(
  providerRef: string,
  env: Record<string, string | undefined>,
): ConnectorSecretLookup {
  const envName = buildConnectorSecretEnvName(providerRef);
  const value = env[envName]?.trim();

  if (!value) return { found: false, envName };
  return { found: true, value };
}

export type ConnectorSecretBundle =
  | { ok: true; values: Record<string, string> }
  | { ok: false; missing: string[]; reason: string };

/**
 * Resolve every reference a connector needs, or refuse.
 *
 * All-or-nothing on purpose. A connector holding an API address but no
 * credential would issue an unauthenticated request to a customer's system and
 * report whatever came back — most likely a 401 the agent would then try to
 * reason about. Failing with the list of variables to set is more useful and
 * cannot half-work.
 */
export function resolveConnectorSecrets(args: {
  /** Reference keys the connector declares, mapped to their provider reference. */
  refs: Array<{ key: string; providerRef: string }>;
  env: Record<string, string | undefined>;
}): ConnectorSecretBundle {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const ref of args.refs) {
    const lookup = resolveConnectorSecret(ref.providerRef, args.env);
    if (lookup.found) {
      values[ref.key] = lookup.value;
    } else {
      missing.push(lookup.envName);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason:
        `This connector is not configured on this deployment. `
        + `Set: ${missing.join(", ")}`,
    };
  }

  return { ok: true, values };
}
