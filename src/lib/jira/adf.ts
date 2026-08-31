/**
 * Minimal builders for the Atlassian Document Format.
 *
 * Jira Cloud REST API v3 rejects plain strings for rich-text fields such as
 * `description` and `comment.body`, so descriptions have to be assembled as an
 * ADF document tree.
 */

export interface AdfNode {
  type: string;
  [key: string]: unknown;
}

export interface AdfDocument extends AdfNode {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

export function doc(...content: Array<AdfNode | null | undefined>): AdfDocument {
  return { type: "doc", version: 1, content: content.filter(Boolean) as AdfNode[] };
}

export function text(value: string): AdfNode {
  return { type: "text", text: value };
}

export function strong(value: string): AdfNode {
  return { type: "text", text: value, marks: [{ type: "strong" }] };
}

export function link(label: string, href: string): AdfNode {
  return { type: "text", text: label, marks: [{ type: "link", attrs: { href } }] };
}

export function paragraph(...content: AdfNode[] | [string]): AdfNode {
  const nodes = typeof content[0] === "string" ? [text(content[0])] : (content as AdfNode[]);
  return { type: "paragraph", content: nodes };
}

export function heading(level: 1 | 2 | 3, value: string): AdfNode {
  return { type: "heading", attrs: { level }, content: [text(value)] };
}

export function rule(): AdfNode {
  return { type: "rule" };
}

export function bulletList(items: AdfNode[][]): AdfNode {
  return {
    type: "bulletList",
    content: items.map((content) => ({
      type: "listItem",
      content: [{ type: "paragraph", content }],
    })),
  };
}

/** Renders `Label: value` bullets — the shape used for the new joiner's details. */
export function detailList(details: Array<[label: string, value: string]>): AdfNode {
  return bulletList(details.map(([label, value]) => [strong(`${label}: `), text(value)]));
}

/** Flattens an ADF document back to plain text (used by the mock client's logs). */
export function toPlainText(node: AdfNode): string {
  if (node.type === "text") return String(node.text ?? "");
  const children = Array.isArray(node.content) ? (node.content as AdfNode[]) : [];
  const inner = children.map(toPlainText).join(node.type === "paragraph" ? "" : "\n");
  return inner;
}
