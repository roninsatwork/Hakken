/**
 * What a company is allowed to connect as a tool server.
 *
 * Kept apart from `mcpServers.ts` for the same reason `connectorSecretPolicy`
 * is kept apart from `aiTools.ts`: these are the guards, and a guard that can
 * only be reached by standing up a database is a guard nobody exercises. Here
 * each one is a plain function with a plain test.
 *
 * The address is checked with `validateHttpConnectorBaseUrl` rather than a
 * second implementation. That guard already refuses plain HTTP, embedded
 * credentials, loopback, the three private ranges, carrier-grade NAT, and the
 * link-local address that is the cloud metadata endpoint — the classic
 * server-side request forgery prize. Writing a second version of that list is
 * how the two drift apart and one of them quietly stops covering something.
 *
 * **Known limit, inherited and worth restating.** A hostname that *resolves* to
 * a private address cannot be detected here; there is no DNS resolution before
 * the request is made. The residual risk is an administrator pointing a server
 * at an internal name. Unlike the HTTP connector — where only a super-admin
 * could do that — a company administrator can reach this, so the blast radius
 * is their own workspace's outbound requests rather than the platform's.
 */

import { validateHttpConnectorBaseUrl } from "./httpConnectorPolicy";
import { assertSafeReferenceValue } from "./connectorSecretPolicy";
import { appError } from "./utils/appError";

/** Long enough for "Acme's finance system", short enough to fit a table cell. */
export const MCP_SERVER_NAME_MAX_CHARS = 80;

export type McpServerAuthMode = "NONE" | "SECRET_REF";

/**
 * Trim and check the name an administrator typed.
 *
 * Returned rather than validated in place, so callers cannot store the untrimmed
 * original by accident — the trimmed value is the only thing that comes back.
 */
export function normaliseServerName(raw: string): string {
  const name = raw.trim();

  if (name.length === 0) {
    throw appError("INVALID_INPUT", "A tool server needs a name.");
  }
  if (name.length > MCP_SERVER_NAME_MAX_CHARS) {
    throw appError(
      "INVALID_INPUT",
      `A tool server name must be ${MCP_SERVER_NAME_MAX_CHARS} characters or fewer.`,
    );
  }

  return name;
}

/**
 * Check the address, and return it normalised.
 *
 * `URL` normalisation matters beyond tidiness: it is what makes two spellings of
 * the same server compare equal later, so a duplicate is caught rather than
 * connected twice under different names.
 */
export function normaliseServerUrl(raw: string): string {
  const decision = validateHttpConnectorBaseUrl(raw.trim());

  if (!decision.ok) {
    // The guard's reasons are written about a connector's base URL. Reword for
    // the person in front of this screen, who has not heard of connectors.
    throw appError("INVALID_INPUT", decision.reason.replace("The connector's base URL", "The server address"));
  }

  return decision.url.toString();
}

/**
 * Whether the credential half of the form is coherent.
 *
 * Both directions are refused deliberately. A missing reference on a server that
 * needs one fails later, at the moment of use, in a place with no form to
 * correct. A reference supplied alongside "no login required" is dead
 * configuration that reads as though a credential is protecting something.
 */
export function assertAuthConsistent(authMode: McpServerAuthMode, secretRef?: string): void {
  const ref = secretRef?.trim();

  if (authMode === "SECRET_REF") {
    if (!ref) {
      throw appError("INVALID_INPUT", "This server needs a credential reference.");
    }
    // Throws if an administrator pasted the credential itself into a field
    // labelled "reference" — the mistake this whole indirection exists to stop.
    assertSafeReferenceValue(ref, "The credential reference");
    return;
  }

  if (ref) {
    throw appError(
      "INVALID_INPUT",
      "Remove the credential reference, or set this server to use one.",
    );
  }
}
