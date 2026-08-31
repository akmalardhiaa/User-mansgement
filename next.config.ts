import type { NextConfig } from "next";

/**
 * The app normally runs as a Node server (API routes, server components).
 *
 * Setting STATIC_EXPORT=true switches to a fully static export for GitHub
 * Pages. That build has no backend, so the deploy workflow strips the
 * server-only routes first — see .github/workflows/deploy-demo.yml.
 */
const isStaticExport = process.env.STATIC_EXPORT === "true";

// Project Pages are served from https://<user>.github.io/<repo>/, so every
// asset and link needs the repository name as a prefix.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
