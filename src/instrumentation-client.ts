/**
 * Browser start-up hook.
 *
 * Next.js runs this before the app hydrates, so a crash during hydration is
 * still reported. It is a separate file from `instrumentation.ts` because that
 * one is server-only — importing the browser SDK there would ship a client
 * bundle into the server runtime and vice versa.
 *
 * `onRouterTransitionStart` lets the SDK see client-side navigation, so an
 * error is attributed to the page the user was actually on rather than the one
 * they first landed on.
 *
 * No-ops when no DSN is configured. See `src/lib/errorMonitoring.ts`.
 */

import * as Sentry from "@sentry/nextjs";

import { initErrorMonitoring } from "./lib/initErrorMonitoring";

initErrorMonitoring();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
