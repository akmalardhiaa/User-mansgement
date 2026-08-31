# HC User Management Dashboard

A Human Capital dashboard for managing employee accounts, where **creating a user is an
approval workflow rather than a database insert**. Submitting the form raises a Jira
approval ticket for the joiner's manager; approval automatically raises a second ticket
for IT Security; closing that ticket activates the account.

Built with Next.js (App Router) + TypeScript + Tailwind CSS, with the backend implemented
as Next.js API Routes.

## The workflow

```
HC submits form
      │
      ▼
┌─────────────────────────┐
│ PENDING_MANAGER_APPROVAL│  Jira ticket #1 → reporting manager
└─────────────────────────┘
      │  manager transitions the ticket (webhook or polling)
      ├─── Rejected ────────────────────────────► REJECTED
      ▼  Approved
┌─────────────────────────┐
│ PENDING_SECURITY_SETUP  │  Jira ticket #2 → IT Security (raised automatically)
└─────────────────────────┘
      │  IT Security closes the ticket
      ▼
┌─────────────────────────┐
│         ACTIVE          │  HC can now disable / re-enable access
└─────────────────────────┘
```

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
| `/`          | Employee directory — searchable table with status badges and access toggles. |
| `/users/new` | Create-user form; submitting raises the manager approval ticket.             |
| `/requests`  | Approval tracker — per-request stepper, Jira ticket links and audit trail.   |

## API

| Method  | Route                    | Purpose                                                        |
| ------- | ------------------------ | -------------------------------------------------------------- |
| `GET`   | `/api/users`             | The roster.                                                     |
| `POST`  | `/api/users`             | **Step 1** — records the joiner as pending and raises ticket #1. |
| `PATCH` | `/api/users/:id/access`  | Enable/disable an existing account. Body: `{ "enabled": bool }`. |
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

## Project structure

```
src/
├── app/
│   ├── page.tsx                        # Dashboard
│   ├── users/new/page.tsx              # Create-user form
│   ├── requests/page.tsx               # Approval tracker
│   └── api/
│       ├── users/route.ts              # GET roster · POST new request (step 1)
│       ├── users/[id]/access/route.ts  # PATCH enable/disable
│       ├── requests/route.ts           # GET requests
│       ├── webhooks/jira/route.ts      # POST Jira transitions (steps 2 & 4)
│       └── workflow/sync/route.ts      # POST polling fallback
├── components/
│   ├── layout/AppShell.tsx
│   ├── ui/                             # StatusBadge, Button, Field, Card
│   ├── dashboard/                      # EmployeeTable, StatsRow, SyncButton
│   ├── users/CreateUserForm.tsx
│   └── requests/RequestCard.tsx
└── lib/
    ├── config/env.ts                   # Lazily-read configuration
    ├── db/                             # store.ts (JSON file) · repository.ts · seed.ts
    ├── jira/                           # jiraService.ts · jiraClient.ts · adf.ts · webhookPayload.ts
    ├── workflow/                       # onboardingWorkflow.ts · statusRules.ts
    ├── validation/userInput.ts
    └── types.ts
```

## Design notes

- **The webhook and the poller share one state machine.** Both call
  `applyIssueStatus()`, so the transition rules exist in exactly one place.
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
production use you would need: authentication and authorisation for the HC pages (every
route is currently open), a real database in place of the JSON store, and either a
signed webhook or an IP allowlist in front of `/api/webhooks/jira`.
