import type { NextConfig } from "next";

/**
 * Security headers applied to every route.
 *
 * - X-Frame-Options: prevents PRDCR being embedded in iframes (clickjacking)
 * - X-Content-Type-Options: stops browsers guessing MIME types (MIME sniffing)
 * - Referrer-Policy: limits referrer info sent to third-party links
 * - Permissions-Policy: disables APIs we don't use (camera, mic, geolocation)
 * - X-DNS-Prefetch-Control: controls whether the browser pre-resolves DNS
 *
 * Note: Content-Security-Policy is intentionally omitted here — it needs
 * careful tuning for Next.js (inline scripts, Image Optimization, etc.)
 * and is best added once the app is closer to production.
 */
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
