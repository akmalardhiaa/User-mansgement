# Account system — setup, API, and testing

Login accounts with email verification, backed by PostgreSQL through Prisma,
authenticated with a JWT in an httpOnly cookie, and passwords hashed with
bcrypt.

This sits **alongside** the HC employee directory rather than replacing it. The
two answer different questions:

| | Question it answers | Storage | Endpoint |
|---|---|---|---|
| **Accounts** | Who may sign in? | PostgreSQL (Prisma `User`) | `/api/accounts` |
| **Employee directory** | Who works here? | JSON store (`src/lib/db`) | `/api/users` |

They are linked only by email address. An employee can exist for months before
anyone gives them a login, which is why there is no foreign key between them.

---

## 1. Setup

### Prerequisites

- Node.js 20+ (developed against 22.13)
- PostgreSQL 14+ reachable from this machine

### Install

```bash
npm install
```

`postinstall` runs `prisma generate`, so the typed client is built for you.

### Create the database

```bash
createdb hc_user_management
# or, from psql:  CREATE DATABASE hc_user_management;
```

### Configure the environment

Copy the example and fill it in. Everything lives in `.env.local`, which is
gitignored — `.env.example` is the documented template.

```bash
cp .env.example .env.local
```

The variables this system needs:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:password@localhost:5432/hc_user_management?schema=public` |
| `JWT_SECRET` | yes | 32+ chars. `openssl rand -hex 32`. Rotating it signs everyone out. |
| `JWT_EXPIRES_IN` | no | Defaults to `15m`. |
| `NEXT_PUBLIC_API_URL` | no | Absolute base for links inside emails. Defaults to `http://localhost:3000`. |
| `EMAIL_SERVICE` | prod only | `gmail`, `smtp`, or `sendgrid`. Unset in dev prints mail to the log. |
| `EMAIL_USER` / `EMAIL_PASSWORD` | for gmail/smtp | Gmail needs an [App Password](https://myaccount.google.com/apppasswords), not your account password. |
| `SENDGRID_API_KEY` | for sendgrid | |
| `EMAIL_FROM` | no | Envelope sender. Falls back to `EMAIL_USER`. |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated allowlist. Closed by default. |

> **Generating a secret**
> ```bash
> node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
> ```

### Apply the schema

```bash
npm run db:migrate      # prisma migrate dev — creates the migration and applies it
```

For an existing deployment, use `npm run db:deploy` (`prisma migrate deploy`),
which applies committed migrations without generating new ones.

### Create the first admin

Registration always creates a `USER`. The first `ADMIN` comes from the seed,
which reads its credentials from the environment so nothing is hardcoded:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-password ADMIN_NAME="Your Name" npm run db:seed
```

Re-running it leaves an existing account with that address untouched, so it is
safe after a migration. The seeded admin is created already verified — it is
made by whoever controls the server, so there is nothing for a confirmation
email to prove, and requiring one would mean the first admin cannot sign in
until SMTP works.

### Run

```bash
npm run dev
```

---

## 2. Prisma 7 notes

Prisma 7 changed two things this project had to accommodate, both of which
differ from most tutorials online:

1. **`url` is no longer allowed in `datasource`.** The connection string lives
   in [`prisma.config.ts`](../prisma.config.ts) for CLI commands. That file
   loads `.env.local` through `@next/env`, so Next and the Prisma CLI read the
   same file with the same precedence instead of each needing their own copy.
2. **The runtime client requires a driver adapter.** `src/lib/db/prisma.ts`
   passes `@prisma/adapter-pg`. There is no engine-dials-the-database path any
   more.

The client is also constructed lazily there, so `next build` — which imports
every route module to collect metadata — does not fail on a missing
`DATABASE_URL` for the many routes that never touch Postgres.

---

## 3. API reference

All responses share one envelope, so a client can branch on `ok` alone:

```jsonc
{ "ok": true,  "data": { /* ... */ } }
{ "ok": false, "error": "Human-readable message", "fieldErrors": { "email": "..." }, "code": "TOKEN_EXPIRED" }
```

### Public

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an unverified account, mail the link |
| `POST` | `/api/auth/verify-email` | Consume a verification token |
| `POST` | `/api/auth/resend-verification` | Issue a fresh verification link |
| `POST` | `/api/auth/login` | Exchange credentials for a JWT cookie |
| `POST` | `/api/auth/logout` | Clear the cookie |
| `POST` | `/api/auth/forgot-password` | Mail a reset link |
| `POST` | `/api/auth/reset-password` | Set a new password from a token |

### Protected

| Method | Path | Who |
|---|---|---|
| `GET` | `/api/auth/me` | Any signed-in user |
| `GET` | `/api/accounts` | Admin only |
| `GET` | `/api/accounts/[id]` | Admin, or the owner |
| `PUT` | `/api/accounts/[id]` | Admin, or the owner (role changes are admin-only) |
| `DELETE` | `/api/accounts/[id]` | Admin only |

### Status codes

| Code | Meaning here |
|---|---|
| `400` | Malformed or already-used token |
| `401` | Not signed in, or bad credentials — retrying with credentials may work |
| `403` | Signed in but not allowed, or email not yet verified — retrying will not help |
| `404` | No such account |
| `409` | Email already registered, or the change would remove the last admin |
| `410` | Token expired — ask for a new one |
| `422` | Validation failed; see `fieldErrors` |
| `429` | Rate limited; see `retryAfter` (seconds) |

---

## 4. Pages

| Route | Access | What it does |
|---|---|---|
| `/register` | public | Create an account |
| `/verify-email?token=…` | public | Confirms automatically; the field is editable for pasted codes |
| `/login` | public | Sign in; offers a resend link when the address is unverified |
| `/forgot-password` | public | Request a reset link |
| `/reset-password?token=…` | public | Choose a new password |
| `/dashboard` | admin | List, search, re-role and delete accounts |
| `/profile` | signed in | Edit own name, email and password |

---

## 5. Email templates

Both messages are rendered by
[`src/lib/email/templates.ts`](../src/lib/email/templates.ts) as inline-styled
tables, because that is what mail clients actually render — Gmail strips
`<style>` from the head, and Outlook's Word renderer ignores most modern
layout. Each message also ships a `text/plain` alternative, so a link is never
reachable only from the HTML.

`verificationEmail(fullName, url, token)` produces:

- **Subject** — `Konfirmasi email Anda — {brand}`
- **Body** — greeting, a "Konfirmasi email" button, the raw URL as a fallback
  for clients that strip links, and a note that it expires in 24 hours
- **Plain text** — the same, plus the bare token for manual entry

`passwordResetEmail(fullName, url, token)` is the same shape with a 1-hour
expiry and wording that makes clear no change has happened yet.

Both take their brand name from `NEXT_PUBLIC_BRAND_NAME`, and every
interpolated value is HTML-escaped — a full name is user input, and it ends up
inside markup.

### Seeing them without an SMTP server

Leave `EMAIL_SERVICE` unset. Mail is printed to the server log instead:

```
[email] EMAIL_SERVICE is unset — not sending.
        to:      ayu@example.com
        subject: Konfirmasi email Anda — Mandiri Sekuritas
        link:    http://localhost:3000/verify-email?token=a1b2c3…
```

In production, an unset `EMAIL_SERVICE` is a hard error rather than a silent
fallback: mail that quietly never arrives is worse than a failed boot.

---

## 6. Testing with curl

The token is delivered as an httpOnly cookie, so use a cookie jar. Every
protected route also accepts `Authorization: Bearer <token>` for non-browser
clients.

```bash
BASE=http://localhost:3000
```

### Register

```bash
curl -s -X POST $BASE/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Ayu Prameswari","email":"ayu@example.com","password":"rahasia123","confirmPassword":"rahasia123"}'
```

```jsonc
{"ok":true,"data":{"user":{...},"emailSent":true,"message":"Akun dibuat. Cek email Anda untuk tautan konfirmasi."}}
```

Copy the token from the server log (or your inbox).

### Verify the email

```bash
curl -s -X POST $BASE/api/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d '{"token":"PASTE_TOKEN_HERE"}'
```

### Log in (saving the cookie)

```bash
curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"email":"ayu@example.com","password":"rahasia123"}'
```

Logging in before verifying returns `403` with `"code":"EMAIL_NOT_VERIFIED"`.

### Who am I

```bash
curl -s $BASE/api/auth/me -b cookies.txt
```

### List accounts (admin only)

```bash
curl -s "$BASE/api/accounts?q=ayu&role=USER&take=50" -b cookies.txt
```

A non-admin gets `403`.

### Read, update, delete one account

```bash
ID=PASTE_USER_ID

curl -s $BASE/api/accounts/$ID -b cookies.txt

curl -s -X PUT $BASE/api/accounts/$ID \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"fullName":"Ayu P."}'

curl -s -X DELETE $BASE/api/accounts/$ID -b cookies.txt
```

Deleting the only remaining admin returns `409` with `"code":"LAST_ADMIN"`.

### Password reset

```bash
curl -s -X POST $BASE/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"ayu@example.com"}'

# Always the same answer, whether or not the address exists.

curl -s -X POST $BASE/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"PASTE_RESET_TOKEN","password":"kataSandiBaru1","confirmPassword":"kataSandiBaru1"}'
```

### Log out

```bash
curl -s -X POST $BASE/api/auth/logout -b cookies.txt -c cookies.txt
```

### Using a bearer token instead

```bash
TOKEN=$(grep hc_token cookies.txt | awk '{print $7}')
curl -s $BASE/api/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## 7. Security notes

**What is implemented**

- Passwords hashed with bcrypt at cost 12, re-hashed on login if the cost has
  since been raised. Passwords are capped at 72 bytes because bcrypt silently
  ignores anything beyond that — two passwords sharing a 72-byte prefix would
  otherwise both unlock the account.
- JWT in an httpOnly, SameSite=Lax cookie, `Secure` in production. The token is
  never returned in a response body, so injected JavaScript cannot read it.
- Tokens are 32 bytes from the OS CSPRNG, single-use, and stored in unique
  columns. Verification links last 24 hours, reset links 1 hour.
- Login answers identically for an unknown address and a wrong password, and
  spends the same bcrypt time on both, so neither the message nor the timing
  reveals which accounts exist. `forgot-password` and `resend-verification`
  answer identically in all cases.
- Role changes are admin-only and re-checked server-side; without that, any
  user could promote themselves by calling `PUT` on their own account.
- The last remaining admin cannot be deleted or demoted.
- Changing an email clears the verified flag and re-sends a confirmation.
- CORS is an explicit allowlist with no wildcard, because the session is a
  cookie.
- Every protected route re-verifies the token itself. `src/proxy.ts` is a
  network-layer gate that produces good redirects — it is not the control.

**What to add before production**

- **Rate limiting.** `src/lib/http/rateLimit.ts` counts in one process's
  memory. That is real protection for a single instance and resets on every
  deploy or cold start; with several instances the effective limit multiplies
  by the instance count. Move it to Redis/Upstash or your platform's edge rate
  limiting, keeping the same call sites.
- **Token revocation.** A JWT stays valid until it expires, so logout cannot
  invalidate a copy taken beforehand. The 15-minute lifetime bounds that
  window; a refresh-token scheme with a revocable refresh token closes it.
- **Account lockout** after repeated failures, and MFA.
- **Audit logging** of admin actions on accounts.
