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
 * number with a unit, a short text, a set of allowed actions, a switch — and so
 * does the one thing that makes such a form honest: what an EMPTY field means is
 * said in words under it. For a narrowing that is "no limit"; for a grant it is
 * "not allowed"; a blank left to be guessed reads as whichever the reader fears.
 */

/**
 * `choices` is a set picked from a fixed vocabulary (which operations an agent
 * may run); `toggle` is a permission that is off unless switched on. Both GRANT
 * rather than narrow, so their `absentMeans` says what is withheld.
 */
export type FieldKind = 'list' | 'number' | 'text' | 'choices' | 'toggle';

export interface Choice {
  value: string;
  label: string;
  /** Choices are rendered under their group's name. */
  group: string;
}

/** A named selection offered above the choices — what most owners mean. */
export interface ChoicePreset {
  label: string;
  values: string[];
}

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
  /** For choices: the vocabulary, and the selections offered as one click. */
  options?: Choice[];
  presets?: ChoicePreset[];
}

export interface PolicyGroup {
  /** The question the group answers, e.g. "Who can it write to?" */
  question: string;
  fields: PolicyField[];
}

/** A field's value as the editor holds it: lists as arrays, numbers as numbers, text as strings. Absent = empty. */
export type PolicyValue = Record<string, string[] | number | string | boolean | undefined>;

export interface PolicySchema {
  /** The connector id, e.g. `gmail`. */
  connector: string;
  /** The secret key the policy is stored under, e.g. `GMAIL_POLICY`. */
  envKey: string;
  groups: PolicyGroup[];
  /** One sentence: what this policy lets the agent do. Read by the owner instead of the fields. */
  summarize(value: PolicyValue): string;
  /**
   * What an EMPTY policy means, when it is not "anyone, no limits". A connector
   * that fails closed — nothing runs until something is allowed — says so here,
   * and the editor shows this instead of the permissive default.
   */
  emptySummary?: string;
  /** Rules across fields, in the owner's words: a write allowed with no daily number, and the like. */
  check?(value: PolicyValue): string[];
}
