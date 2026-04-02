import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { createSecureHeaders } from 'next-secure-headers';

 
const nextConfig: NextConfig = {
  output: 'standalone',
  headers() {
    return [{ source: "/(.*)", headers: createSecureHeaders() }];
  },
};
 
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);