# Two ways to run this portal, and the difference is not a detail.
#
#   --target dev   `next dev`, the demo. Simulated directory, email written to
#                  files, no TLS. What `jalankan-podman.bat` builds.
#   --target prod  `next build` + `next start`, for the internal server. Nine
#                  production guards apply, and every one of them refuses the
#                  demo configuration rather than quietly degrading — see
#                  MENJALANKAN.md part 2.
#
# The default target is `dev`, because running the demo is what somebody does
# first and a default that needs a real domain controller would make the first
# command fail for a reason nobody has yet been told about.

# ---------------------------------------------------------------------------
# Dependencies, shared by both targets
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


# ---------------------------------------------------------------------------
# dev — the demo
# ---------------------------------------------------------------------------
FROM deps AS dev
WORKDIR /app
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["npx", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]


# ---------------------------------------------------------------------------
# build — compiles the frontend and the server routes
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .

# The build must not read a real configuration, and must not need one. Next
# inlines NEXT_PUBLIC_* at build time and nothing else, so the branding is
# given here and every secret arrives at run time instead. A build that needed
# the production .env would mean the image could only ever be built on the
# server it runs on.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BRAND_NAME="User Management"
ENV NEXT_PUBLIC_BRAND_LOGO="/brand/logo.svg"

RUN npm run build


# ---------------------------------------------------------------------------
# prod — what runs on the internal server
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Only what serving needs. The source tree, the dev toolchain and the test
# files are left behind: a server that can rebuild itself is a server with a
# compiler and a copy of the source on it, and neither has a reason to be
# there.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

# The store and the simulated-directory file live here. On the server this is a
# mounted volume — see compose.yaml — because a JSON store inside a container
# is a JSON store that disappears with it.
RUN mkdir -p data

# Not root. The portal writes to data/ and reads a CA certificate, and needs
# nothing else; it has no business being able to write to its own code.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# `next start` rather than `next dev`: the compiled output, no file watcher, no
# dev overlay, and the security headers and CSP from next.config.ts and
# proxy.ts applied to real responses.
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
