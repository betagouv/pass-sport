/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  devIndicators: false,
  // Ships only the file-traced subset of node_modules. scripts/scalingo-cleanup.sh then
  // drops the build residue that pushed the Scalingo image past its 2 GiB limit.
  output: 'standalone',
  // bullmq is server-only and lazily requires optional clients it does not ship
  // (@valkey/valkey-glide). Bundling it makes the bundler try to resolve that
  // optional import and warn; keeping it external lets Node require it at runtime.
  serverExternalPackages: ['bullmq'],
  // pdfkit (via @react-pdf/renderer) loads its standard fonts lazily through the
  // "#standard-fonts/*" imports map, with createRequire() — so Node picks the "require"
  // condition and reads the .cjs variants. File tracing resolves that map statically with
  // the "import" condition and only copies the .mjs ones, so the standalone build throws
  // ERR_MODULE_NOT_FOUND on Helvetica.cjs the first time a PDF is rendered.
  outputFileTracingIncludes: {
    '/api/france-connect/pdf': [
      './node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**/*.cjs',
    ],
  },
  experimental: {
    // Prevents Next.js from focusing <main tabIndex={-1}> after client-side
    // navigation, which scrolled the header out of view (see PageTitle #header)
    appNewScrollHandler: true,
  },
  headers: async () => [
    {
      // CSP frame-ancestors (src/proxy.ts) does not cover /api nor legacy browsers
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jedonnemonavis.numerique.gouv.fr',
        port: '',
        pathname: '/static/**',
        search: '',
      },
    ],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.woff2$/,
      type: 'asset/resource',
    });
    return config;
  },
};

export default withSentryConfig(nextConfig);
