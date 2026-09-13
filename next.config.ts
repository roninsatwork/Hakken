import { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';
import path from 'node:path';
import { buildAppContentSecurityPolicy } from './src/lib/securityHeaders';

// The e2e auth bypass must never ship armed. It is correctly gated at every
// consumer (src/proxy.ts and the fixture routes all check this env var), but
// that safety rested entirely on nobody ever setting it in production. Fail
// the build instead of trusting the fleet's env config forever.
if (process.env.E2E_AUTH_ENABLED === '1' && process.env.NODE_ENV === 'production') {
  throw new Error(
    'E2E_AUTH_ENABLED=1 in a production build: this would ship a working auth bypass. Unset it.'
  );
}

const nextConfig: NextConfig = {
  // The optional local Arcade check must not replace the running app's cache.
  ...(process.env.SONAE_ARCADE_CHECK === '1'
    ? { distDir: '.next-arcade', typescript: { tsconfigPath: 'tsconfig.arcade.json' } }
    : {}),
  env: {
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
  },
  // Keep physical-device capture sessions on the local development host connected to
  // Turbopack/HMR. Override this when the Mac's LAN address changes; production does
  // not use this development-only origin allow-list.
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "192.168.1.60")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  output: 'standalone',
  ...(process.env.E2E_AUTH_ENABLED === '1'
    ? {
        turbopack: {
          resolveAlias: {
            'convex/react': './src/e2e/convexReactMock.tsx',
          },
        },
      }
    : {}),
  webpack(config) {
    if (process.env.E2E_AUTH_ENABLED === '1') {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'convex/react': path.resolve(process.cwd(), 'src/e2e/convexReactMock.tsx'),
      };
    }

    return config;
  },
  async headers() {
    const defaultHeaders = createSecureHeaders({
      contentSecurityPolicy: buildAppContentSecurityPolicy(process.env),
    });

    // `frameGuard: false` drops X-Frame-Options so the widget can be framed at
    // all. Which sites may frame it is decided per widget, at request time, by
    // `applyWidgetEmbedPolicy` in src/proxy.ts — it emits an enforcing
    // `Content-Security-Policy: frame-ancestors` built from that widget's
    // allowedDomains. No frame-ancestors directive is declared here: static
    // config has no request context, and the spec ignores frame-ancestors in
    // report-only policies anyway, so declaring one would only mislead.
    const embedHeaders = createSecureHeaders({
      frameGuard: false,
      contentSecurityPolicy: {
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "https:", "wss:", "ws:"],
          frameSrc: ["'self'", "https:"],
        },
      },
    });

    return [
      { source: "/", headers: defaultHeaders },
      { source: "/login", headers: defaultHeaders },
      { source: "/admin/:path*", headers: defaultHeaders },
      { source: "/app/:path*", headers: defaultHeaders },
      { source: "/sandbox/:path*", headers: defaultHeaders },
      { source: "/w/:path*", headers: embedHeaders },
      { source: "/embed.js", headers: embedHeaders },
    ];
  },
  async redirects() {
    return [
      {
        source: "/admin/companies/:id/users",
        destination: "/admin/companies/:id/directory/users",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/invites",
        destination: "/admin/companies/:id/directory/invites",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/knowledge",
        destination: "/admin/companies/:id/ai/knowledge",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/prompt",
        destination: "/admin/companies/:id/ai/prompt",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/system-prompt",
        destination: "/admin/companies/:id/ai/prompt",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/rules/new",
        destination: "/admin/companies/:id/ai/rules/new",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/rules/:ruleId",
        destination: "/admin/companies/:id/ai/rules/:ruleId",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/rules",
        destination: "/admin/companies/:id/ai/rules",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/models",
        destination: "/admin/companies/:id/ai/models",
        permanent: false,
      },
      {
        source: "/admin/companies/:id/chat-logs",
        destination: "/admin/companies/:id/ai/chat-logs",
        permanent: false,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

/**
 * Sentry's build step, which does two jobs beyond the runtime SDK.
 *
 * It installs the hooks that let server-side errors be attributed to a request,
 * and — only when given a token — it uploads source maps so a stack trace names
 * a line of our code instead of a column in a minified bundle.
 *
 * Upload is switched off unless `SENTRY_AUTH_TOKEN` is present. A build should
 * not need a secret to succeed: CI, a local production build, and anyone who
 * clones this repo all build without one, and a plugin that fails or warns
 * loudly in that state trains people to ignore build output. With no token the
 * traces still arrive, just minified.
 */
const sourceMapsConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default withSentryConfig(withNextIntl(nextConfig), {
  ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
  sourcemaps: { disable: !sourceMapsConfigured },
  // The plugin's own progress output, not ours. Errors still surface.
  silent: true,
  // Strips Sentry's internal debug logging from the production bundle.
  // (`disableLogger` is the deprecated spelling and warns under Turbopack.)
  webpack: { treeshake: { removeDebugLogging: true } },
});
