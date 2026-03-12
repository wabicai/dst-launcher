const nextOutputMode = process.env.NEXT_OUTPUT_MODE === 'server' ? undefined : 'export';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(nextOutputMode ? { output: nextOutputMode } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@dst-launcher/shared'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
