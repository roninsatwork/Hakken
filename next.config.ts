import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';
import path from 'node:path';

const nextConfig: NextConfig = {
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
      contentSecurityPolicy: {
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "https:", "wss:", "ws:"],
          frameSrc: ["'self'", "https:"],
          frameAncestors: ["'self'"],
        },
      },
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
export default withNextIntl(nextConfig);
