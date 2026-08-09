/**
 * Server and edge start-up hook.
 *
 * Next.js calls `register` once per runtime before any request is served, which
 * is the only point early enough to catch a failure during the first render.
 * `onRequestError` is the matching hook for server-side errors — React Server
 * Components, route handlers, and server actions all report through it, and
 * none of them pass through a client error boundary, so without this they would
 * be invisible.
 *
 * Both no-op when no DSN is configured. See `src/lib/errorMonitoring.ts`.
 */

import * as Sentry from "@sentry/nextjs";

import { initErrorMonitoring } from "./lib/initErrorMonitoring";

export function register() {
  initErrorMonitoring();
}

export const onRequestError = Sentry.captureRequestError;
