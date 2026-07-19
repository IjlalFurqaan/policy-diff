import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are cached by tag and invalidated by the crawler, so every read that
  // feeds a page is a `use cache` function and everything else lives behind a
  // Suspense boundary.
  cacheComponents: true,
  // jsdom and readability are CommonJS-heavy and must not be bundled by the
  // server compiler — they are only ever loaded inside the crawler.
  serverExternalPackages: ["jsdom", "@mozilla/readability"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
