import type { SortKey } from "@/lib/dashboard/directory";

import type { Dictionary } from "./dictionaries/id";

/**
 * Labels for things the code names by a key rather than by a word.
 *
 * A sort key, a status, a lifecycle stage: the value is part of the model and
 * must not change with the language, so the model keeps the key and this maps
 * it to whatever the reader is reading. Kept here rather than in each component
 * so two places cannot drift into calling the same key different things.
 */

const SORT_KEY_LABEL: Record<SortKey, keyof Dictionary["directory"]> = {
  name: "columnName",
  department: "columnDepartment",
  jobTitle: "columnJobTitle",
  status: "columnStatus",
  updated: "columnUpdated",
};

export function sortLabel(t: Dictionary, key: SortKey): string {
  return t.directory[SORT_KEY_LABEL[key]];
}
