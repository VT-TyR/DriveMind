/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['googleapis', 'genkit'],
  env: {
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  },
  // Ensure TypeScript path mapping works properly
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': new URL('./src', import.meta.url).pathname,
    };
    return config;
  },
}

export default nextConfig;