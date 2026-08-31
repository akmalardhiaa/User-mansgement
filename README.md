# HC User Management Dashboard

A Human Capital dashboard for managing employee accounts, where **creating a user is an
approval workflow rather than a database insert**. Submitting the form raises a Jira
approval ticket for the joiner's manager; approval automatically raises a second ticket
for IT Security; closing that ticket activates the account.

Built with Next.js (App Router) + TypeScript + Tailwind CSS, with the backend implemented
as Next.js API Routes.

## The workflow

Adding an account and moving someone between divisions run the **same two-step
chain**. HC never changes anything directly — Jira does, once the manager approves.

```
                 HC raises the request
                          │
                          ▼
          ┌───────────────────────────────┐
          │  Jira ticket #1 → the manager │   assigned, so Jira emails them
          └───────────────────────────────┘
                          │
        Rejected ◄────────┴────────► Approved
            │                            │
            ▼                            ▼
   new account → REJECTED   ┌───────────────────────────────┐
   transfer    → unchanged  │ Jira ticket #2 → IT Security  │  raised automatically
                            └───────────────────────────────┘
                                         │  IT Security closes it
                                         ▼
                          new account → ACTIVE
                          transfer    → new department, position and manager applied
```

| Request | HC action | While pending | When IT Security closes ticket #2 |
| --- | --- | --- | --- |
| **Add an account** | *Tambah akun* form | `Menunggu manager` → `Penyiapan IT Security` | `Aktif` |
| **Move divisions** | *Ubah posisi* on a row | `Pindah divisi · menunggu manager` → `Pindah divisi · IT Security` | new position applied, back to `Aktif` |

A transfer changes nothing until that last step: the target department, position and
manager sit on the request, so the directory never shows a move that has not actually
happened. A rejected transfer leaves the employee exactly where they were.

**Disable/Enable is separate and deliberately unmediated.** It is a reversible suspension
HC can apply immediately, without waiting on an approval.

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — see "Jira mock mode" below
npm run dev                    # http://localhost:3000
```

The app boots with a seeded roster and a **mock Jira client**, so the entire flow is
clickable before any credentials exist.

## Pages

| Route        | Purpose                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| `/login`     | Sign-in for HC officers. Everything else redirects here without a session.   |
| `/`          | Employee directory — searchable table with status badges and access toggles. |
| `/users/new` | Create-user form; submitting raises the manager approval ticket.             |
| `/requests`  | Approval tracker — per-request stepper, Jira ticket links and audit trail.   |

## API

| Method  | Route                    | Purpose                                                        |
| ------- | ------------------------ | -------------------------------------------------------------- |
| `POST`  | `/api/auth/login`        | Exchanges credentials for a session cookie.                     |
| `POST`  | `/api/auth/logout`       | Clears the session.                                             |
| `GET`   | `/api/users`             | The roster.                                                     |
| `POST`  | `/api/users`             | **Step 1** — records the joiner as pending and raises ticket #1. |
| `PATCH` | `/api/users/:id/access`  | Enable/disable immediately. Body: `{ "enabled": bool }`.        |
| `POST`  | `/api/users/:id/transfer`| Raises a transfer request. Body: `{ department, jobTitle, … }`. |
| `GET`   | `/api/requests`          | All onboarding requests with tickets and audit trail.            |
| `POST`  | `/api/webhooks/jira`     | **Steps 2 & 4** — applies Jira transitions.                      |
| `POST`  | `/api/workflow/sync`     | Polling fallback; applies the same transitions.                  |

## Jira mock mode

Jira is mocked whenever `JIRA_DOMAIN`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and
`JIRA_PROJECT_KEY` are missing or still hold `.env.example` placeholders. Set
`JIRA_MOCK=false` to require a real connection (the app fails fast if credentials are
incomplete) or `JIRA_MOCK=true` to force the mock.

Mock tickets open in `To Do` and never move on their own — drive them by POSTing to the
webhook exactly as Jira would:

```bash
# 1. Submit a joiner; note the returned manager ticket key (e.g. HC-1001)
curl -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' -d '{
  "name": "Nadia Kusuma", "email": "nadia.kusuma@example.com",
  "jobTitle": "Backend Engineer", "department": "Engineering",
  "managerName": "Sarah Wijaya"
}'

# 2. Manager approves → the IT Security ticket is raised automatically
curl -X POST http://localhost:3000/api/webhooks/jira -H 'Content-Type: application/json' -d '{
  "webhookEvent": "jira:issue_updated",
  "user": { "displayName": "Sarah Wijaya" },
  "issue": { "key": "HC-1001" },
  "changelog": { "items": [{ "field": "status", "toString": "Approved" }] }
}'

# 3. IT Security closes their ticket → the employee becomes Active
curl -X POST http://localhost:3000/api/webhooks/jira -H 'Content-Type: application/json' -d '{
  "issue": { "key": "HC-1002" },
  "changelog": { "items": [{ "field": "status", "toString": "Done" }] }
}'
```

## Connecting real Jira

1. Create an API token at
   <https://id.atlassian.com/manage-profile/security/api-tokens> and fill in
   `JIRA_DOMAIN`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_PROJECT_KEY`.
2. Set `JIRA_SECURITY_ACCOUNT_ID` to the IT Security team's Jira `accountId` so
   provisioning tickets are assigned automatically. Look it up with
   `/rest/api/3/user/search?query=<email>`.
3. Map your workflow's column names onto the three status lists
   (`JIRA_APPROVED_STATUSES`, `JIRA_REJECTED_STATUSES`,
   `JIRA_SECURITY_DONE_STATUSES`) — matching is case-insensitive.
4. Register the webhook in Jira under **System → WebHooks** for the *issue updated*
   event, scoped with a JQL filter such as `project = HC`:

   ```
   https://your-app.example.com/api/webhooks/jira?secret=<JIRA_WEBHOOK_SECRET>
   ```

   The secret may also be sent as an `x-hc-webhook-secret` header. Jira Cloud does not
   sign webhooks, so this shared secret is the authentication mechanism; it is compared
   in constant time. Leaving `JIRA_WEBHOOK_SECRET` unset disables the check — acceptable
   locally, never in a deployed environment.

If webhooks cannot reach the app, `POST /api/workflow/sync` (the **Sync from Jira**
button, and a suitable cron target) reconciles every open request instead. Transitions
are de-duplicated, so webhook and polling can safely run side by side.

## Login

Every page and API route sits behind a session, enforced in `src/middleware.ts`. Two
things are deliberately left open:

- `/login` and the auth endpoints, for obvious reasons.
- `POST /api/webhooks/jira`, because Jira calls it as a machine and has no session to
  present. It authenticates with its own shared secret instead — locking it behind the
  session would silently break the approval chain.

Accounts come from `HC_AUTH_USERS`, as `email:password:Name` triples separated by commas.
Each officer having their own login is what lets the audit trail name a person:

```
Ayu Prameswari (HC) | HC mengajukan pembuatan akun untuk Nadia Kusuma.
```

The session is a cookie signed with `AUTH_SECRET` (HMAC-SHA256, 8-hour expiry,
httpOnly + sameSite=lax, secure in production). It is built on Web Crypto so the same
code verifies it in middleware (Edge) and in route handlers (Node).

**This is a stand-in, not an identity system.** Passwords live in an environment
variable, and there is no reset, lockout, MFA, or revocation before expiry — rotating
`AUTH_SECRET` is the only way to sign everyone out. Put SSO in front of it before it
holds anything sensitive.

## How approvers are notified

Managers and the IT Security team are **not** emailed by this app. They are emailed by
Jira, because each ticket is assigned to them — Jira's notification scheme sends the
assignee an email on issue creation, and that email links straight to the ticket they
approve from. Nothing else has to be configured, and no SMTP credentials are involved.

That makes assignment the part that matters:

- **Manager.** HC enters the manager's work email on the form. The backend resolves it to
  a Jira account through `/rest/api/3/user/search` and assigns ticket #1. Setting
  `managerAccountId` on the API request overrides the lookup.
- **IT Security.** Set `JIRA_SECURITY_EMAIL` (or `JIRA_SECURITY_ACCOUNT_ID`, which wins)
  so ticket #2 is assigned when it is raised automatically.

When no account matches, the request still goes through — an unassigned ticket beats no
ticket — but the confirmation panel and the audit trail both say plainly that nobody was
emailed, so it is never a silent failure:

```
HC-1002 was assigned to IT Security, so Jira emails them the approval request.
Nobody was notified: No Jira account matches it-security@acme.com, so the ticket is
unassigned and Jira will not email the IT Security.
```

Jira's user search only finds people who can be assigned issues in the project, so both
approvers need Jira accounts with permission there. If emails still do not arrive, check
**Project settings → Notifications** — the default scheme notifies the current assignee on
*Issue Created*, but a customised scheme may have removed it.

## Deployment

### GitHub Pages (static demo)

`.github/workflows/deploy-demo.yml` publishes a **browser-only demo** to GitHub Pages on
every push to `main`.

> **This demo has no backend.** GitHub Pages serves static files only, so the API routes
> and the real Jira integration do not run there. The workflow removes them from its own
> checkout — the repository is untouched — and exports `src/app/demo` instead, where an
> in-browser store and a "Jira simulator" panel stand in for the server. State resets on
> refresh. It is a UI walkthrough, not a working system.

**Required one-time setup: Settings → Pages → Source: "GitHub Actions".**

The workflow cannot do this for you — creating a Pages site is not something the
`GITHUB_TOKEN` is permitted to do, so the deploy fails with
`Resource not accessible by integration` until the setting is switched on by hand. Once
it is, re-run the workflow from the Actions tab; the site is then published at
`https://<user>.github.io/<repo>/`.

To preview the demo locally: `npm run dev`, then open `/demo`.

### Vercel (full application)

The complete app — API routes included — needs a Node host. Vercel imports it with no
configuration: Next.js is detected automatically and no environment variables are
required for a first look, because Jira falls back to its mock.

<https://vercel.com/new/clone?repository-url=https://github.com/akmalardhiaa/User-mansgement>

This is also the only deployment where `POST /api/webhooks/jira` gets a public URL that
Jira can actually call. To connect a real site, add the variables from `.env.example` in
**Project → Settings → Environment Variables**, then register
`https://<your-deployment>/api/webhooks/jira?secret=…` in Jira.

**Storage caveat.** Serverless platforms mount the deployment read-only, so the JSON
store falls back to `/tmp` (see `getDataFilePath()`). That path is per-instance and is
wiped on cold starts, which is fine for a demo but means data is neither durable nor
shared between instances. For anything real, point `HC_DATA_FILE` at a mounted volume or
replace `src/lib/db` with a database.

### Any other Node host

Railway, Render, Fly.io, or your own server all work the same way: set the environment
variables from `.env.example`, then `npm run build && npm run start`.

## Project structure

```
src/
├── middleware.ts                       # Session gate for every page and API route
├── app/
│   ├── page.tsx                        # Dashboard
│   ├── login/page.tsx                  # Sign-in
│   ├── users/new/page.tsx              # Create-user form
│   ├── requests/page.tsx               # Approval tracker
│   ├── demo/page.tsx                   # Static GitHub Pages demo entry point
│   └── api/
│       ├── users/route.ts              # GET roster · POST new request (step 1)
│       ├── users/[id]/access/route.ts  # PATCH enable/disable
│       ├── users/[id]/transfer/route.ts # POST transfer request (step 1)
│       ├── requests/route.ts           # GET requests
│       ├── webhooks/jira/route.ts      # POST Jira transitions (steps 2 & 4)
│       └── workflow/sync/route.ts      # POST polling fallback
├── components/
│   ├── layout/AppShell.tsx
│   ├── demo/DemoApp.tsx                # Browser-only demo shell + Jira simulator
│   ├── ui/                             # StatusBadge, Button, Field, Card
│   ├── dashboard/                      # EmployeeTable, StatsRow, SyncButton
│   ├── users/CreateUserForm.tsx
│   └── requests/RequestCard.tsx
└── lib/
    ├── auth/                           # session.ts · users.ts · current.ts
    ├── config/env.ts                   # Lazily-read configuration
    ├── client/dataSource.ts            # UI write operations (API or demo mock)
    ├── demo/demoStore.ts               # In-browser workflow used by the demo
    ├── db/                             # store.ts (JSON file) · repository.ts · seed.ts
    ├── jira/                           # jiraService.ts · jiraClient.ts · adf.ts · webhookPayload.ts
    ├── workflow/                       # accessWorkflow.ts · statusRules.ts
    ├── validation/userInput.ts
    └── types.ts
```

## Design notes

- **The webhook and the poller share one state machine.** Both call
  `applyIssueStatus()`, so the transition rules exist in exactly one place.
- **Adding and transferring share that machine too.** They differ only in a `FLOW` table
  of end statuses and a `COPY` table of ticket wording, so the two flows cannot drift
  apart.
- **A transfer is applied, not promised.** The target position lives on the request and is
  written onto the employee only when IT Security closes their ticket.
- **Transitions are idempotent.** Jira delivers webhooks at least once. Each
  `${issueKey}:${status}` signal is claimed inside a single store transaction *before*
  any Jira call, so a redelivered approval can never raise two provisioning tickets.
- **Failed submissions leave nothing behind.** If Jira rejects or is unreachable while
  raising the manager ticket, the employee record is deleted and the API returns `502` —
  a joiner without an approval ticket could never progress.
- **A failed security ticket rolls the approval back** to `MANAGER_APPROVAL` so the next
  webhook delivery or sync retries it.
- **Storage is swappable.** Only `src/lib/db/` touches the JSON file; the rest of the app
  goes through `repository.ts`. Writes are serialised behind a mutex and committed with
  write-then-rename, so concurrent webhooks cannot interleave or truncate the file.
- **The UI does not depend on `fetch`.** Components take a `DashboardDataSource`, so the
  same table and form serve both the real API and the static demo's in-browser store.
- **Status names are configuration, not code** — every team names their Jira columns
  differently.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Limitations

This is a scaffold for a real integration, not a finished internal system. Before
production use you would need: SSO in place of the environment-variable logins (see
**Login** above), authorisation as well as authentication — every signed-in officer can
do everything — a real database in place of the JSON store, and either a signed webhook
or an IP allowlist in front of `/api/webhooks/jira`.

The palette approximates Mandiri Sekuritas' navy and gold by eye, not from a brand
guide. The values live in the `@theme` block of `src/app/globals.css` and nowhere else,
so correcting them is a single edit.
