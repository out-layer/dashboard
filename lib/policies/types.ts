/**
 * A connector's policy, described once so one editor can render every
 * connector's.
 *
 * Add a connector by writing its schema (see `gmail.ts`) — `PolicyEditor`
 * renders it, `policy.ts` turns it into the JSON the connector reads and back,
 * and neither needs to learn anything about the connector.
 *
 * A policy is the owner's rule about what their agent may do with a credential:
 * who it may write to, how much it may spend, which markets it may touch. Each
 * connector reads its own JSON, but the shapes repeat — a list of names, a
 * number with a unit, a short text — and so does the one thing that makes such
 * a form honest: every field is a NARROWING of a consent already given, so an
 * empty field means "no limit", and the form has to say that in words rather
 * than leave a blank that reads as "nothing allowed".
 */

export type FieldKind = 'list' | 'number' | 'text';

export interface PolicyField {
  /** The key in the JSON the connector reads. */
  key: string;
  label: string;
  kind: FieldKind;
  /** The (i) text: what the rule does, in the owner's terms. */
  help: string;
  /** What leaving it empty permits. Shown under the field whenever it is empty. */
  absentMeans: string;
  placeholder?: string;
  /** For numbers: what is being counted. */
  unit?: string;
  min?: number;
  /** For lists: turn what was typed into the value the connector compares. */
  normalize?: (entry: string) => string;
  /** For lists: the reason an entry is refused, or null. Runs after normalize. */
  validateEntry?: (entry: string) => string | null;
}

export interface PolicyGroup {
  /** The question the group answers, e.g. "Who can it write to?" */
  question: string;
  fields: PolicyField[];
}

/** A field's value as the editor holds it: lists as arrays, numbers as numbers, text as strings. Absent = empty. */
export type PolicyValue = Record<string, string[] | number | string | undefined>;

export interface PolicySchema {
  /** The connector id, e.g. `gmail`. */
  connector: string;
  /** The secret key the policy is stored under, e.g. `GMAIL_POLICY`. */
  envKey: string;
  groups: PolicyGroup[];
  /** One sentence: what this policy lets the agent do. Read by the owner instead of the fields. */
  summarize(value: PolicyValue): string;
}
