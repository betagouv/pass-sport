/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  devIndicators: false,
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
