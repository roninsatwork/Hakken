import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';

 
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    const defaultHeaders = createSecureHeaders();
    const embedHeaders = createSecureHeaders({ frameGuard: false });

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