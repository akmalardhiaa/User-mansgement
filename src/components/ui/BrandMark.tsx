import { getBrand } from "@/lib/config/brand";

/**
 * The company lockup: the official logo when one has been supplied, otherwise a
 * neutral "HC" tile so the app never ships a redrawn approximation of a
 * trademark.
 */
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const brand = getBrand();
  const tile = size === "lg" ? "size-9 text-sm" : "size-8 text-xs";
  const logoHeight = size === "lg" ? "h-9" : "h-7";

  return (
    <span className="flex items-center gap-2.5">
      {brand.logo ? (
        // A logo is an author-supplied SVG or PNG of unknown intrinsic size, and
        // next/image cannot optimise SVG anyway, so a plain img is correct here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo}
          alt={brand.name}
          className={`${logoHeight} w-auto object-contain`}
        />
      ) : (
        <span
          className={`grid ${tile} place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-soft font-bold text-accent-ink`}
          aria-hidden
        >
          HC
        </span>
      )}
      <span className="text-sm font-semibold tracking-tight">
        {brand.logo ? "User Management" : brand.name}
      </span>
    </span>
  );
}
