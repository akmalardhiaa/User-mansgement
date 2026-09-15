/**
 * Where the HC store lives on disk.
 *
 * This used to sit in `env.ts` next to the Jira settings, which is how it was
 * deleted along with them — and with it the only thing telling the JSON store
 * where to read and write. It has nothing to do with Jira, so it lives on its
 * own now.
 */

/** Absolute path of the JSON file backing the store. */
export function getDataFilePath(): string {
  const configured = process.env.HC_DATA_FILE?.trim();
  if (configured) return configured;

  // Serverless platforms mount the deployment read-only; /tmp is the only
  // writable path. It is per-instance and wiped between cold starts, so this
  // is fine for a demo deployment but is not durable storage — point
  // HC_DATA_FILE at a real volume, or swap src/lib/db for a database.
  if (isServerless()) return "/tmp/hc-store.json";

  return "data/hc-store.json";
}

/** True on Vercel, Netlify Functions, and plain AWS Lambda. */
function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}
