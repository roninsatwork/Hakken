import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';
import path from 'node:path';

const nextConfig: NextConfig = {
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
          frameAncestors: ["*"],
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
