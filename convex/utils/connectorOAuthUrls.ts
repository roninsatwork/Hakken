import type { Id } from "../_generated/dataModel";
import { appError } from "./appError";
import {
  CONNECTOR_OAUTH_UNAVAILABLE_MESSAGE,
  isConnectorOAuthAvailable,
} from "../aiToolExecutionService";

/**
 * Where an administrator is sent to connect a tool, and whether they can be.
 *
 * URL building and a configuration check, neither of which needs the database
 * or belongs among the endpoints that call them.
 */

export function buildOAuthState(connectorId: Id<"toolConnectors">, now: number) {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `connector:${connectorId}:${now}:${hex}`;
}

/**
 * Where the Connect button sends the administrator: the deployment's own
 * authorize route (`connectorOAuth.ts`), absolute because the admin screen
 * runs on the app origin and the route on the Convex site origin. Only the
 * state travels — provider, scopes and credentials are resolved server-side
 * from the pending connection it names.
 */
export function buildOAuthAuthorizationUrl(args: { state: string }) {
  const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  const params = new URLSearchParams({ state: args.state });
  return `${siteUrl}/api/connectors/oauth/authorize?${params.toString()}`;
}

/**
 * Whether this connector can be taken through an OAuth flow today: the
 * provider's client credentials and the token encryption key must be
 * configured on this deployment.
 */
export function assertConnectorOAuthAvailable(provider: string) {
  if (!isConnectorOAuthAvailable(provider)) {
    throw appError("NOT_CONFIGURED", CONNECTOR_OAUTH_UNAVAILABLE_MESSAGE);
  }
}

