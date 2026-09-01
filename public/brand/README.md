# Company logo

Drop the official logo file here and point `NEXT_PUBLIC_BRAND_LOGO` at it:

```
NEXT_PUBLIC_BRAND_LOGO=/brand/logo.svg
NEXT_PUBLIC_BRAND_NAME=Mandiri Sekuritas
```

SVG is preferred — it stays sharp at any size and the header renders it at 28px
tall. A PNG works too; export it at 3× the display height so it holds up on
high-density screens.

Use the asset from your brand or marketing team. Nothing here redraws a
trademark: a logo reproduced from memory is wrong in exactly the details a brand
is recognised by.

Without the file, the app falls back in this order:

1. A typographic wordmark of `NEXT_PUBLIC_BRAND_NAME` — plain type in the brand
   colours, which is honest about being text rather than a mark. This is a
   reasonable interim while the official asset is being sourced.
2. A neutral "HC" tile, when no name is set either.

`NEXT_PUBLIC_*` values are inlined at build time, so a change needs a rebuild.
