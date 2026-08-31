import { getJiraConfig, type JiraConfig } from "@/lib/config/env";

import type { AdfDocument } from "./adf";
import { toPlainText } from "./adf";

/**
 * Transport layer for the Jira Cloud REST API v3.
 *
 * Two implementations sit behind one interface: `RestJiraClient` talks to a real
 * site over HTTPS, and `MockJiraClient` keeps issues in memory so the project
 * runs end-to-end before anyone has provisioned an API token.
 */

export interface CreateIssueInput {
  summary: string;
  description: AdfDocument;
  issueType: string;
  /** Jira accountId. Omitted when HC did not supply one — the issue stays unassigned. */
  assigneeAccountId?: string;
  labels?: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  /** Browser URL, e.g. https://acme.atlassian.net/browse/HC-42 */
  url: string;
  summary?: string;
  status?: string;
  assignee?: string;
}

export interface JiraClient {
  createIssue(input: CreateIssueInput): Promise<JiraIssue>;
  getIssue(issueKey: string): Promise<JiraIssue>;
  addComment(issueKey: string, body: AdfDocument): Promise<void>;
}

export class JiraApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "JiraApiError";
  }
}

function browseUrl(config: JiraConfig, key: string): string {
  return `https://${config.domain}/browse/${key}`;
}

/* -------------------------------------------------------------------------- */
/* Live client                                                                */
/* -------------------------------------------------------------------------- */

class RestJiraClient implements JiraClient {
  constructor(private readonly config: JiraConfig) {}

  /**
   * Jira Cloud authenticates API tokens with HTTP Basic using the account email
   * as the username and the token as the password.
   */
  private authHeader(): string {
    const raw = `${this.config.email}:${this.config.apiToken}`;
    return `Basic ${Buffer.from(raw).toString("base64")}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
    let response: Response;
    try {
      response = await fetch(`https://${this.config.domain}${path}`, {
        ...init,
        headers: {
          Authorization: this.authHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
      });
    } catch (cause) {
      // DNS/TLS/connection failures surface as a plain TypeError. Normalise them
      // so callers only ever have to handle JiraApiError.
      throw new JiraApiError(
        `Could not reach Jira at ${this.config.domain}: ${(cause as Error).message}`,
        503,
        cause,
      );
    }

    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as unknown) : undefined;

    if (!response.ok) {
      throw new JiraApiError(
        `Jira responded ${response.status} for ${init.method ?? "GET"} ${path}: ${
          describeError(payload) ?? raw.slice(0, 300)
        }`,
        response.status,
        payload,
      );
    }

    return payload as T | undefined;
  }

  async createIssue(input: CreateIssueInput): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: this.config.projectKey },
      summary: input.summary,
      description: input.description,
      issuetype: { name: input.issueType },
    };
    if (input.assigneeAccountId) fields.assignee = { id: input.assigneeAccountId };
    if (input.labels?.length) fields.labels = input.labels;

    const created = await this.request<{ id: string; key: string }>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    if (!created?.key) {
      throw new JiraApiError("Jira accepted the issue but returned no issue key.", 502, created);
    }

    return { id: created.id, key: created.key, url: browseUrl(this.config, created.key) };
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const issue = await this.request<{
      id: string;
      key: string;
      fields?: {
        summary?: string;
        status?: { name?: string };
        assignee?: { displayName?: string };
      };
    }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,assignee`);

    if (!issue?.key) {
      throw new JiraApiError(`Jira returned no issue for ${issueKey}.`, 404, issue);
    }

    return {
      id: issue.id,
      key: issue.key,
      url: browseUrl(this.config, issue.key),
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name,
      assignee: issue.fields?.assignee?.displayName,
    };
  }

  async addComment(issueKey: string, body: AdfDocument): Promise<void> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

/** Pulls the human-readable part out of Jira's error envelope. */
function describeError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as { errorMessages?: string[]; errors?: Record<string, string> };
  const messages = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
  return messages.length ? messages.join("; ") : undefined;
}

/* -------------------------------------------------------------------------- */
/* Mock client                                                                */
/* -------------------------------------------------------------------------- */

interface MockIssue extends JiraIssue {
  description: string;
  comments: string[];
}

/**
 * In-memory stand-in for Jira. Issues open in "To Do"; drive them forward by
 * POSTing to `/api/webhooks/jira` (see the README) exactly as Jira would.
 */
class MockJiraClient implements JiraClient {
  private counter = 1000;
  private readonly issues = new Map<string, MockIssue>();

  constructor(private readonly config: JiraConfig) {}

  async createIssue(input: CreateIssueInput): Promise<JiraIssue> {
    this.counter += 1;
    const key = `${this.config.projectKey}-${this.counter}`;
    const issue: MockIssue = {
      id: String(this.counter),
      key,
      url: browseUrl(this.config, key),
      summary: input.summary,
      status: "To Do",
      assignee: input.assigneeAccountId,
      description: toPlainText(input.description),
      comments: [],
    };
    this.issues.set(key, issue);
    console.info(`[jira:mock] created ${key} — ${input.summary}`);
    return issue;
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const issue = this.issues.get(issueKey.toUpperCase());
    if (!issue) {
      throw new JiraApiError(`Mock Jira has no issue ${issueKey}.`, 404);
    }
    return issue;
  }

  async addComment(issueKey: string, body: AdfDocument): Promise<void> {
    const issue = this.issues.get(issueKey.toUpperCase());
    issue?.comments.push(toPlainText(body));
    console.info(`[jira:mock] commented on ${issueKey}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

// Cached on globalThis so the mock client's issues survive Next.js hot reloads.
const globalForJira = globalThis as typeof globalThis & { __hcJiraClient?: JiraClient };

export function getJiraClient(): JiraClient {
  const config = getJiraConfig();
  if (!config.mock) return new RestJiraClient(config);
  globalForJira.__hcJiraClient ??= new MockJiraClient(config);
  return globalForJira.__hcJiraClient;
}
