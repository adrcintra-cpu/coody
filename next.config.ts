import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pode abrir dentro do Oxyhub (hub.oxyhub.com.br/s/coody) e em nenhum outro site.
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://hub.oxyhub.com.br" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }];
  },
};

export default nextConfig;
