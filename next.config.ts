import type { NextConfig } from "next";

/**
 * The app normally runs as a Node server (API routes, server components).
 *
 * Setting STATIC_EXPORT=true switches to a fully static export for GitHub
 * Pages. That build has no backend and therefore no approval emails, no
 * execution worker and no sessions — it is a visual preview only.
 *
 * There is no deploy workflow in this repository; an earlier comment here
 * pointed at `.github/workflows/deploy-demo.yml`, which does not exist.
 */
const isStaticExport = process.env.STATIC_EXPORT === "true";

// Project Pages are served from https://<user>.github.io/<repo>/, so every
// asset and link needs the repository name as a prefix.
const basePath = process.env.PAGES_BASE_PATH ?? "";

/**
 * Response headers.
 *
 * `Referrer-Policy: no-referrer` is the one that earns its place here rather
 * than being boilerplate. An approval link necessarily carries its token in the
 * URL — that is what an emailed link is — and the default referrer policy would
 * hand that URL to any third-party resource the page loads, in a header, on
 * every request. The page loads none today; this makes sure a future one cannot
 * leak the token by accident.
 *
 * The token is still single-use, short-lived, and bound to one stage of one
 * version. Those are the controls that matter; this stops the credential
 * travelling further than the person it was sent to.
 *
 * A full Content-Security-Policy with nonces belongs with the rest of the HTTP
 * hardening and is not attempted here — a half-configured CSP that has to be
 * loosened later is worse than one added deliberately.
 */
const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  // Stops a browser second-guessing a declared content type, which is how a
  // JSON response gets executed as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing here is meant to be framed. Clickjacking an Approve button is a
  // real thing to prevent on a page whose whole purpose is a decision.
  { key: "X-Frame-Options", value: "DENY" },
  /*
   * Content-Security-Policy is NOT here.
   *
   * It carries a per-request nonce and is therefore set by `src/proxy.ts`,
   * which is the only place that can generate one before the page renders.
   * Declaring a second, static CSP here would not add strictness — two policies
   * are enforced as their intersection — but it would make the effective policy
   * something nobody can read in one place.
   */
];

/**
 * Where the build output goes.
 *
 * Overridable so a production build can be taken WITHOUT overwriting the tree a
 * running `next dev` is serving from. Sharing one directory between the two
 * leaves a mixed `.next`, and the symptom is baffling: nested route handlers
 * start answering with a 404 HTML page while their parent still works.
 */
const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";

/**
 * `next dev` writes AGENTS.md into the project root on every run, and rewrites
 * it after anybody deletes it. That file is gone by request, so the generator
 * is off rather than fighting it: `agentRules: false` is what the guide in
 * node_modules/next/dist/docs/01-app/02-guides/ai-agents.md names for this.
 */
const agentRules = false;

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      distDir,
      images: { unoptimized: true },
      agentRules,
    }
  : {
      distDir,
      agentRules,
      /*
       * The floating development badge, off.
       *
       * The demo runs `next dev` deliberately (see jalankan.bat), and that
       * badge was the only thing saying so on screen — a "Rendering…"
       * pill and an N button in the corner of every page, including during a
       * demo. Next still surfaces compile and runtime errors with this off, so
       * nothing is being hidden except the ornament. Set it to
       * `{ position: "bottom-left" }` to bring it back.
       */
      devIndicators: false,
      async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
      },
    };

export default nextConfig;
