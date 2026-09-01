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
trademark: without this file the app falls back to a neutral "HC" mark, which is
better than shipping an approximation that is subtly wrong.

`NEXT_PUBLIC_*` values are inlined at build time, so a change needs a rebuild.
