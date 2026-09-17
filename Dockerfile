# The portal, as a container you can hand to somebody.
#
# ---------------------------------------------------------------------------
# Why this runs in DEVELOPMENT mode, deliberately
# ---------------------------------------------------------------------------
# This image is the demo target, and the choice is forced rather than lazy. The
# application carries nine separate production guards, and every one of them
# refuses the configuration this project actually has today:
#
#   auth/ad.ts          no LDAP_URL in production -> authenticateAD THROWS.
#                       Not degraded: nobody can sign in at all.
#   auth/mockAdAuth.ts  MOCK_AD_LOGIN refused in production.
#   ad/index.ts         AD_DRIVER=mock refused in production.
#   email/index.ts      EMAIL_DRIVER=file refused, and EMAIL_REDIRECT_TO refused
#                       — the safety net that keeps approval tokens off
#                       strangers' inboxes.
#   lifecycle/outboxCrypto.ts   OUTBOX_ENCRYPTION_KEY unset -> throws.
#   auth/session.ts     secure:true on the session cookie, so the browser will
#                       not send it over plain http://localhost and a login
#                       never sticks without HTTPS in front.
#
# So `next start` here would produce a container that boots cleanly and then
# refuses every login and every email. That is worse than no container, because
# it looks like it works.
#
# A production image is a different artefact with different inputs — a real
# domain controller, a real mailbox, a generated encryption key, and a reverse
# proxy terminating TLS. It is not this file with a flag flipped.
# ---------------------------------------------------------------------------

# Debian rather than Alpine: `sharp` (pulled in transitively by Next) is the one
# dependency where musl still costs more care than the saved megabytes are
# worth. Everything this application itself depends on — exceljs, nodemailer,
# ldapts, jose — is pure JavaScript and would run on either.
#
# Node 22 matches .github/workflows/ci.yml, so the container and the gate that
# guards the branch are running the same runtime.
FROM node:22-bookworm-slim

# Next writes build artefacts and the app writes its JSON stores; neither needs
# anything outside /app.
WORKDIR /app

# The manifest and lockfile first, on their own layer. Dependencies only
# reinstall when one of these two changes — editing a component does not throw
# away the install.
COPY package.json package-lock.json ./

# `ci`, not `install`: it installs exactly what the lockfile pins and fails if
# the lockfile and manifest disagree. Dev dependencies are kept deliberately —
# `next dev` needs TypeScript, Tailwind and the PostCSS pipeline at run time.
RUN npm ci

# Then the source. node_modules, data/ and .env* are excluded by .dockerignore;
# the first would import Windows binaries, and the other two would bake a live
# App Password and a table of approval tokens into a layer that survives any
# later deletion.
COPY . .

# The state directory, created here so the container still starts when nothing
# is mounted over it. A bind mount at /app/data replaces this and is what makes
# the roster, the sessions and the simulated directory outlive the container.
RUN mkdir -p data

EXPOSE 3000

# -H 0.0.0.0 is stated rather than relied upon. `next dev --help` on 16.3.3
# reports 0.0.0.0 as the default already, so this changes nothing today; it is
# here because the failure it guards against is disproportionately confusing. A
# server bound to localhost inside a container is reachable from nowhere, the
# published port answers nothing, and the app looks broken rather than
# misbound — so the binding is worth naming out loud instead of inheriting.
CMD ["npx", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]
