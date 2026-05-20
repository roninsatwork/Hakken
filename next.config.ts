import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';

 
const nextConfig: NextConfig = {
  output: 'standalone',
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
};
 
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);