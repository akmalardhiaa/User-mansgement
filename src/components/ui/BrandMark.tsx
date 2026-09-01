import { getBrand } from "@/lib/config/brand";

/**
 * The company lockup, in order of preference:
 *
 *   1. The official logo file, when one has been supplied.
 *   2. A typographic wordmark of the company name — plain text set in the brand
 *      colours, which is honest about being type rather than a mark.
 *   3. A neutral "HC" tile.
 *
 * The app never draws an approximation of a trademark: a logo redrawn from
 * memory is wrong in exactly the details a brand is recognised by.
 */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const brand = getBrand();
  const named = brand.name !== "User Management";

  const logoHeight = size === "lg" ? "h-9" : "h-7";
  const wordmarkSize = size === "lg" ? "text-lg" : "text-sm";
  const tile = size === "lg" ? "size-9 text-sm" : "size-8 text-xs";

  return (
    <span className="flex items-center gap-2.5">
      {brand.logo ? (
        // An author-supplied SVG or PNG of unknown intrinsic size; next/image
        // cannot optimise SVG anyway, so a plain img is correct here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt={brand.name} className={`${logoHeight} w-auto object-contain`} />
      ) : named ? (
        <span className={`${wordmarkSize} font-semibold tracking-tight text-ink`}>
          {brand.name}
        </span>
      ) : (
        <span
          className={`grid ${tile} place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-soft font-bold text-accent-ink`}
          aria-hidden
        >
          HC
        </span>
      )}

      <span className="h-5 w-px bg-hairline-strong" aria-hidden />

      <span className="text-sm font-medium tracking-tight text-ink-muted">User Management</span>
    </span>
  );
}
