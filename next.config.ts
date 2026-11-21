import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const connectSrc = [
  "'self'",
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  "https://*.reown.com",
  "wss://*.reown.com",
  "https://api.web3modal.org",
  "https://*.web3modal.org",
  "https://safe-transaction-mainnet.safe.global",
  "https://safe-transaction-base.safe.global",
  "https://safe-transaction-arbitrum.safe.global",
  "https://safe-transaction-sepolia.safe.global",
  "https://api.safe.global",
  "https://*.safe.global",
  "https://www.4byte.directory",
  ...(isDev ? ["http://127.0.0.1:42069", "http://localhost:42069", "ws://localhost:3000"] : []),
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com https://explorer-api.walletconnect.com",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
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
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  turbopack: {
    resolveAlias: {
      "@x402/core/client": "./src/shared/lib/empty-module.ts",
      "@x402/evm": "./src/shared/lib/empty-module.ts",
      "@x402/evm/exact/client": "./src/shared/lib/empty-module.ts",
      "@x402/evm/upto/client": "./src/shared/lib/empty-module.ts",
      "@x402/svm/exact/client": "./src/shared/lib/empty-module.ts",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
