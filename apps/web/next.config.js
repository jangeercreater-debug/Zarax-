/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server-only env vars (BACKEND_URL, cookie secret) are read directly via
  // process.env in Route Handlers/Server Components — never exposed to the client
  // bundle. Only NEXT_PUBLIC_* vars would be, and none are needed today.
};

module.exports = nextConfig;
