# Account approval workflow

HC creates an account that stays **locked** until two people approve it by email:
the employee's **manager**, then the **CISO / IT Security**. When both have approved,
the account activates and the new user is told by email.

```
HC mengajukan ──► Manager setuju ──► CISO / IT Security setuju ──► Akun aktif
  (form)          (email + link)       (email + link)                (email ke user)
      │                 │                      │
      │                 └── tolak ─────────────┴── tolak ──► email alasan ke HC
```

## How it behaves, and why

| Rule | Why |
| --- | --- |
| Only an **ADMIN** (HC) can submit the form | The approver emails are typed into the form. An open form lets anyone name themselves as their own approver. |
| Manager, CISO and the new user must be **three different addresses** | Two-person rule — nobody approves their own account, nobody approves both steps. |
| The CISO email is sent **after** the manager approves | Template 2 states the manager's approval date, and the CISO's 24 hours start then. |
| **Separate token per role**, stored as a SHA-256 hash | A manager link can never be replayed as the CISO's approval, and a leaked database hands out no working links. |
| `approvingRole` in the request must match the token's role | The server derives the role from the token and returns `403 ROLE_MISMATCH` otherwise. |
| Tokens expire (`APPROVAL_TOKEN_EXPIRY`, default 24h) and are single-use | A link sitting in a mailbox is not a standing key. |
| Opening a link changes nothing; only the buttons (POST) do | Mail scanners follow every link in a message. |
| Every action writes an `ApprovalLog` row | Who did what, when — including emails that failed to send. |
| A locked account cannot sign in | Login returns `403 APPROVAL_PENDING` / `APPROVAL_REJECTED`. Password reset no longer unlocks an account. |
| If the manager email cannot be sent, the submission is undone | A request nobody was told about could never move. |

Public self sign-up (`POST /api/auth/register`) was removed: it let anyone create an
account without any approval.

## Setup

### 1. Environment (`.env.local`)

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5433/hc_user_management?schema=public"
JWT_SECRET="<node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\">"
NEXT_PUBLIC_API_URL="http://localhost:3000"

# Gmail with an App Password
EMAIL_SERVICE="gmail"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-16-char-app-password"

# Test config: every email goes to TEST_RECIPIENT while TEST_MODE is true
TEST_MODE="true"
TEST_RECIPIENT="colecbened@gmail.com"

APPROVAL_TOKEN_EXPIRY="24h"
```

Leave `EMAIL_SERVICE` unset in development and emails are printed to the server log
instead of sent — every link is still usable from there.

**Gmail App Password:** open <https://myaccount.google.com/apppasswords> with the
sending account, turn on 2-Step Verification if asked, create one named e.g.
`HC Portal`, and paste the 16 letters into `EMAIL_PASSWORD`.

### 2. Database

```bash
npm install                # also runs prisma generate
npx prisma migrate dev     # applies init_accounts + approval_workflow
ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='StrongPass123' ADMIN_NAME="HC Admin" npm run db:seed
```

Production: `npx prisma migrate deploy`.

### 3. Run

```bash
npm run dev
```

Sign in as the admin, then use **Buat user** (`/register`) and **Approval user**
(`/approval-requests`) in the navigation.

## API

| Method | Route | Access | Body / query |
| --- | --- | --- | --- |
| POST | `/api/auth/register-with-approval` | ADMIN | `email, fullName, password, confirmPassword?, department, managerEmail, managerName, cisoEmail, cisoName, notes?` |
| GET | `/api/approval/[token]` | token | — |
| POST | `/api/approval/approve` | token | `token, approvingRole` (`manager` \| `it_security`) |
| POST | `/api/approval/reject` | token | `token, approvingRole, reason` (min 5 chars) |
| GET | `/api/approvals` | ADMIN | `?status=&q=&take=&skip=` |
| GET | `/api/approvals/[requestId]` | ADMIN | — (includes audit log) |

Statuses: `PENDING → MANAGER_APPROVED → IT_APPROVED → ACTIVE`, or
`MANAGER_REJECTED` / `IT_REJECTED` (terminal).

## Manual test

1. Sign in as admin → **Buat user**. Fill it in with a manager and a CISO address.
2. With `TEST_MODE=true`, the manager email arrives at `colecbened@gmail.com`,
   subject prefixed `[TES → manager@…]`. Click **SETUJUI** → press **Setujui** on the page.
3. The CISO email arrives (showing the manager's approval date). Click **SETUJUI** →
   **Setujui & aktifkan akun**.
4. **Approval user** shows the request as **Aktif**, with the full audit trail.
5. The "Selamat! Akun Anda Sudah Aktif" email arrives. The new user can now sign in.

Rejection: click **TOLAK**, write a reason, submit. HC receives "Permohonan User Ditolak"
with the reason and who rejected it; the account stays locked.

## curl

```bash
# sign in as admin (cookie jar)
curl -c jar.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@company.com","password":"StrongPass123"}'

# submit
curl -b jar.txt -X POST localhost:3000/api/auth/register-with-approval -H 'Content-Type: application/json' \
  -d '{"email":"nadia@company.com","fullName":"Nadia Kusuma","password":"Rahasia123","department":"Research",
       "managerEmail":"manager@company.com","managerName":"Dimas","cisoEmail":"ciso@company.com","cisoName":"Tim CISO"}'

# TOKEN comes from the email link (or the server log when EMAIL_SERVICE is unset)
curl localhost:3000/api/approval/TOKEN
curl -X POST localhost:3000/api/approval/approve -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN","approvingRole":"manager"}'
curl -X POST localhost:3000/api/approval/reject -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN","approvingRole":"it_security","reason":"Belum ada surat penugasan"}'

# admin list
curl -b jar.txt 'localhost:3000/api/approvals?status=PENDING'
```

## Production notes

- Set `TEST_MODE=false`.
- Rate limits are in-memory per instance (`src/lib/http/rateLimit.ts`). Behind more than
  one instance, move them to a shared store such as Redis.
- `NEXT_PUBLIC_API_URL` must be the public URL: it is what the email buttons link to.
