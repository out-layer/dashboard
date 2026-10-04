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
 *
 * How every connector's policy decides an action — the rule each schema here
 * mirrors, and the order the connector applies it in:
 *
 * 1. **What the owner set decides first.** The actions ticked, the limits
 *    typed, the switches turned on: the agent gets those and nothing wider.
 * 2. **What the owner left empty falls to the connector's own default for that
 *    field** — the field's `absentMeans`, said under it: no cap, any recipient,
 *    no attachments, whatever the connector reads an absent key as.
 * 3. **Everything else is refused.** An action no rule allows does not run.
 *    The one exception is a connector whose policy is a fence around the
 *    agent's own wallet (Polymarket, Hyperliquid): with no policy at all, or an
 *    empty one, it runs on its built-in open default, which `emptySummary` says.
 *
 * "Ask me before" is not a fourth step: it takes an action the policy allows
 * and makes it wait for the owner's yes. Asking about an action therefore
 * allows it — ticking it there ticks it among the allowed actions, and
 * unticking it there removes it from the asks (`asksBefore`).
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
  /** For choices: nothing ticked allows every choice, rather than none. */
  emptyMeansAll?: boolean;
  /** For toggles: the choices the switch acts through, when it qualifies operations rather than standing alone. */
  link?: SwitchLink;
  /**
   * For choices: this is an "ask me before" set over the choices field `key`
   * names — the actions the policy allows. An action asked about is an action
   * allowed after the owner's yes, so the two move together: ticking one here
   * ticks it there; unticking it there unticks it here.
   */
  asksBefore?: string;
}

/**
 * A switch that only means something through certain choices — "public gists"
 * is a property of creating a gist, "approve" one of a review. Held as two
 * fields they drift apart: the switch on and the operation it qualifies not
 * ticked reads as allowed and does nothing. The editor keeps them together
 * (`change` in `policy.ts`) and a stored policy that has them apart is flagged.
 */
export interface SwitchLink {
  /** The choices field the switch is read together with. */
  key: string;
  /** Choices the switch acts through: with none of them allowed it changes nothing. */
  through: string[];
  /** What turning the switch on ticks when none of `through` is allowed. */
  ticks: string[];
  /** Choices that do nothing without the switch, so they and the switch are one decision: ticking one turns the switch on, turning the switch off unticks them. */
  onlyWith?: string[];
}

export interface PolicyGroup {
  /** The question the group answers, e.g. "Who can it write to?" */
  question: string;
  fields: PolicyField[];
  /** One line under the group's fields: what choosing anything here sets in motion. */
  note?: string;
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
