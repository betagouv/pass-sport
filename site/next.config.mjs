/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  devIndicators: false,
  // bullmq is server-only and lazily requires optional clients it does not ship
  // (@valkey/valkey-glide). Bundling it makes the bundler try to resolve that
  // optional import and warn; keeping it external lets Node require it at runtime.
  serverExternalPackages: ['bullmq'],
  experimental: {
    // Prevents Next.js from focusing <main tabIndex={-1}> after client-side
    // navigation, which scrolled the header out of view (see PageTitle #header)
    appNewScrollHandler: true,
  },
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
