/**
 * Company branding.
 *
 * The logo is a file the organisation drops into `public/brand/`, never
 * something this app draws: a trademark redrawn from memory is wrong in the
 * details that matter, and the real asset always exists somewhere internally.
 *
 * Read through NEXT_PUBLIC_* so client components can use them — these values
 * are inlined at build time, so changing them needs a rebuild.
 */

export interface Brand {
  /** Path under /public, or undefined to fall back to the built-in "HC" mark. */
  logo?: string;
  /** Rendered beside the logo, and used as its alt text. */
  name: string;
}

export function getBrand(): Brand {
  const logo = process.env.NEXT_PUBLIC_BRAND_LOGO?.trim();
  return {
    logo: logo && !logo.startsWith("your-") ? logo : undefined,
    name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "User Management",
  };
}
