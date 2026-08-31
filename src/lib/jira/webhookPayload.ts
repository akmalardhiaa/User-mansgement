import { timingSafeEqual } from "node:crypto";

import { getWebhookSecret } from "@/lib/config/env";

/**
 * Parsing and authenticating inbound Jira webhooks.
 *
 * Jira Cloud webhooks are not signed, so the accepted practice is to register
 * the URL with a shared secret in a header or query string and compare it in
 * constant time on arrival.
 */

export interface ParsedWebhook {
  issueKey: string;
  statusName: string;
  actor?: string;
  webhookEvent?: string;
}

interface JiraWebhookBody {
  webhookEvent?: string;
  issue?: { key?: string; fields?: { status?: { name?: string } } };
  changelog?: { items?: Array<{ field?: string; fieldId?: string; toString?: string }> };
  user?: { displayName?: string };
  // Accepted for local testing / manual replay:
  issueKey?: string;
  status?: string;
  actor?: string;
}

/**
 * Pulls the issue key and its new status out of a webhook body.
 *
 * The status changelog entry is preferred over `issue.fields.status` because a
 * bulk edit can change several fields at once, and the changelog is the part
 * that actually tells us a transition happened.
 */
export function parseJiraWebhook(payload: unknown): ParsedWebhook | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as JiraWebhookBody;

  const issueKey = body.issue?.key ?? body.issueKey;
  if (!issueKey) return undefined;

  const statusChange = body.changelog?.items?.find(
    (item) => item.field === "status" || item.fieldId === "status",
  );
  const statusName = statusChange?.toString ?? body.issue?.fields?.status?.name ?? body.status;
  if (!statusName) return undefined;

  return {
    issueKey,
    statusName,
    actor: body.user?.displayName ?? body.actor,
    webhookEvent: body.webhookEvent,
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies the shared secret. Returns true when `JIRA_WEBHOOK_SECRET` is unset,
 * which keeps local development frictionless — set it in any deployed
 * environment.
 */
export function isAuthorisedWebhook(request: Request): boolean {
  const expected = getWebhookSecret();
  if (!expected) return true;

  const presented =
    request.headers.get("x-hc-webhook-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  return constantTimeEquals(expected, presented);
}
