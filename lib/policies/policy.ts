import type { PolicyField, PolicyGroup, PolicyRule, PolicySchema, PolicyValue, RuleSpec, RuleThen, SwitchLink } from './types';

/** Every field of the schema, flat. */
export function fields(schema: PolicySchema): PolicyField[] {
  return schema.groups.flatMap((g) => g.fields);
}

function isEmpty(v: PolicyValue[string]): boolean {
  return v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/** A policy that narrows nothing. */
export function emptyValue(): PolicyValue {
  return {};
}

/** True when no field narrows anything — the policy `{}` writes. */
export function isUnrestricted(value: PolicyValue): boolean {
  return Object.values(value).every(isEmpty);
}

/**
 * The JSON the connector reads. Only the schema's keys, and only the ones set:
 * a connector refuses a key it does not know, and an absent key is how "no
 * limit" is spelled — `null` would say the same thing less clearly.
 */
export function toJson(schema: PolicySchema, value: PolicyValue): string {
  const out: Record<string, unknown> = {};
  for (const f of fields(schema)) {
    const v = value[f.key];
    if (isEmpty(v)) continue;
    // A rule is written with only the conditions it sets: an emptied field
    // is no condition, and the connector would refuse an empty list as one.
    out[f.key] = f.kind === 'rules' ? rulesOf(v).map((r) => ({ when: { op: r.when.op, ...Object.fromEntries(conditionsOf(r)) }, then: r.then })) : v;
  }
  return JSON.stringify(out);
}

/**
 * A stored policy back into the editor. `null` and absent both mean empty.
 * Keys the schema does not know are reported, not dropped silently: the
 * connector would refuse the whole policy over one of them, and re-saving from
 * this editor would remove it — the owner should know both.
 */
export function fromJson(
  schema: PolicySchema,
  json: string | Record<string, unknown>,
): { value: PolicyValue; unknownKeys: string[] } {
  const obj: Record<string, unknown> = typeof json === 'string' ? JSON.parse(json) : json;
  const known = new Map(fields(schema).map((f) => [f.key, f]));
  const value: PolicyValue = {};
  const unknownKeys: string[] = [];
  for (const [k, raw] of Object.entries(obj)) {
    const f = known.get(k);
    if (!f) {
      unknownKeys.push(k);
      continue;
    }
    if (raw === null || raw === undefined) continue;
    if (f.kind === 'rules') {
      // Read as written, in order: what the editor cannot read is kept for
      // `validate` to name, never dropped on a re-save.
      if (Array.isArray(raw)) value[k] = raw as PolicyRule[];
    } else if (f.kind === 'list' || f.kind === 'choices') {
      value[k] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    } else if (f.kind === 'toggle') {
      if (raw === true) value[k] = true;
    } else if (f.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n)) value[k] = n;
    } else {
      value[k] = String(raw);
    }
  }
  return { value, unknownKeys };
}

/** The strings of a list or choices value. */
export function strings(v: PolicyValue[string]): string[] {
  return chosen(v);
}

function chosen(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** The toggles that act through a choices field, each with that field. */
function links(schema: PolicySchema): { toggle: PolicyField; link: SwitchLink; choices: PolicyField }[] {
  const all = fields(schema);
  return all.flatMap((toggle) => {
    const link = toggle.kind === 'toggle' ? toggle.link : undefined;
    const choices = link && all.find((f) => f.key === link.key && f.kind === 'choices');
    return link && choices ? [{ toggle, link, choices }] : [];
  });
}

/** Whether `values` allows at least one of `wanted`, given what an empty field means. */
function allowsAny(choices: PolicyField, values: string[], wanted: string[]): boolean {
  if (values.length === 0) return choices.emptyMeansAll === true;
  return wanted.some((w) => values.includes(w));
}

/**
 * `value` with `key` set to `v`, and every switch kept in step with the choices
 * it acts through (see `SwitchLink`):
 *
 * - a switch turned on while none of its operations is allowed ticks them;
 * - a switch turned off unticks the operations that do nothing without it —
 *   unless that would leave a field whose empty means "everything" empty;
 * - an operation that does nothing without its switch, newly ticked, turns the
 *   switch on;
 * - choices that no longer allow any of a switch's operations (unticked, a
 *   group switched off, cleared) turn the switch off.
 */
export function change(schema: PolicySchema, value: PolicyValue, key: string, v: PolicyValue[string]): PolicyValue {
  // An action asked about is an action allowed (`asksBefore`): ticked under
  // "Manual approval", it is ticked among the allowed actions too — and that
  // change goes through the rest of `change`, so its switches follow.
  for (const ask of fields(schema)) {
    if (ask.kind !== 'choices' || !ask.asksBefore) continue;
    const target = fields(schema).find((f) => f.key === ask.asksBefore && f.kind === 'choices');
    if (!target) continue;
    if (key === ask.key) {
      const allowed = chosen(value[target.key]);
      const missing = chosen(v).filter((c) => !allowed.includes(c));
      if (missing.length > 0) {
        const order = (target.options ?? []).map((o) => o.value);
        const widened = order.filter((o) => allowed.includes(o) || missing.includes(o));
        return change(schema, { ...value, [key]: v }, target.key, widened);
      }
    }
  }
  const next: PolicyValue = { ...value, [key]: v };
  // An action no longer allowed is no longer asked about.
  for (const ask of fields(schema)) {
    if (ask.kind !== 'choices' || !ask.asksBefore || key !== ask.asksBefore) continue;
    const allowed = chosen(next[ask.asksBefore]);
    const asked = chosen(next[ask.key]);
    const kept = asked.filter((c) => allowed.includes(c));
    if (kept.length !== asked.length) next[ask.key] = kept.length > 0 ? kept : undefined;
  }
  for (const { toggle, link, choices } of links(schema)) {
    const order = (choices.options ?? []).map((o) => o.value);
    const now = chosen(next[link.key]);
    const only = link.onlyWith ?? [];
    if (key === toggle.key) {
      if (v === true && !allowsAny(choices, now, link.through)) {
        next[link.key] = order.filter((o) => now.includes(o) || link.ticks.includes(o));
      } else if (v !== true && now.some((c) => only.includes(c))) {
        const kept = now.filter((c) => !only.includes(c));
        if (kept.length > 0) next[link.key] = kept;
        else if (!choices.emptyMeansAll) next[link.key] = undefined;
      }
    } else if (key === link.key) {
      const before = chosen(value[link.key]);
      if (!allowsAny(choices, now, link.through)) next[toggle.key] = undefined;
      else if (now.some((c) => only.includes(c) && !before.includes(c))) next[toggle.key] = true;
    }
  }
  return next;
}

/**
 * What the policy decides for one operation. `refused`: it does not run.
 * `automatic`: the agent runs it within the bounds, without asking. `asked`: it
 * is prepared and waits in the owner's inbox; the owner's yes runs it.
 */
export type Decision = 'refused' | 'automatic' | 'asked';

/** One row of the decision table: an operation, a field that grants by being set, or an operation made of fields. */
export interface DecisionRow {
  /** The operation's name, `field:<key>` for a field with a `row`, or a derived row's id. */
  id: string;
  label: string;
  group: string;
  /** The row can be refused: unticking "Auto-approve" refuses it. */
  refusable: boolean;
  /** The row can wait for the owner: it has a "Manual approval" box. */
  askable: boolean;
  /** Fields that must be set for the row to run (`needs`, or a derived row's `requires`). */
  needs: string[];
  /** Made of its fields: ticked when they are set, and ticked by setting them. */
  derived: boolean;
  /** What the row does, for its tooltip: the help of the field behind it. */
  help?: string;
}

const FIELD_ROW = 'field:';

/**
 * The schema's decision table: the field listing what waits for the owner
 * (`asks`), the field listing what is allowed (`asksBefore`'s target, or a
 * field marked `actions`), the fields that grant by being set (`row`), the
 * group the table is titled by, and its rows in order. Null when there is
 * nothing to decide.
 */
export function decisionFields(
  schema: PolicySchema,
): { ask?: PolicyField; allowed?: PolicyField; gates: PolicyField[]; group?: PolicyGroup; rows: DecisionRow[] } | null {
  const all = fields(schema);
  const ask = all.find((f) => (f.kind === 'choices' || f.kind === 'rules') && f.asks);
  const allowed = ask?.asksBefore
    ? all.find((f) => f.key === ask.asksBefore && f.kind === 'choices')
    : all.find((f) => f.kind === 'choices' && f.actions);
  const gates = all.filter((f) => f.row);
  const derived = schema.derivedRows ?? [];
  if (!ask && !allowed && gates.length === 0 && derived.length === 0) return null;
  // The table's title and note are the group of the ask field, or of the
  // allowed-actions field; its rows are every allowed-actions option, or —
  // with no such field — every option of a choices ask field (Gmail's send).
  const titled = ask ?? allowed;
  const group = titled ? schema.groups.find((g) => g.fields.includes(titled)) : undefined;
  const listed = allowed ?? (ask?.kind === 'choices' ? ask : undefined);
  const askable = new Set((ask?.kind === 'rules' ? ask.ruleSpec?.ops : ask?.options)?.map((o) => o.value) ?? []);
  const rows: DecisionRow[] = (listed?.options ?? []).map((o) => ({
    id: o.value,
    label: o.label,
    group: o.group,
    refusable: Boolean(allowed),
    askable: askable.has(o.value),
    needs: schema.needs?.[o.value] ?? [],
    derived: false,
  }));
  for (const d of derived) rows.push({ id: d.id, label: d.label, group: d.group, refusable: true, askable: false, needs: d.requires, derived: true });
  for (const f of gates) rows.push({ id: FIELD_ROW + f.key, label: f.row!.label, group: f.row!.group, refusable: true, askable: false, needs: [], derived: false, help: f.help });
  // An operation that is one decision with its switch carries the switch's explanation.
  for (const r of rows) {
    const t = all.find((f) => f.kind === 'toggle' && f.link?.onlyWith?.includes(r.id));
    if (t && !r.help) r.help = t.help;
  }
  return { ask, allowed, gates, group, rows };
}

/** A switch shown only through rows of the table: one with a `row`, or one that is a single decision with its operations (`link.onlyWith`). */
export function shownAsRows(field: PolicyField): boolean {
  return field.kind === 'toggle' && (Boolean(field.row) || (field.link?.onlyWith?.length ?? 0) > 0);
}

function gateOf(schema: PolicySchema, id: string): PolicyField | undefined {
  return id.startsWith(FIELD_ROW) ? fields(schema).find((f) => f.key === id.slice(FIELD_ROW.length) && f.row) : undefined;
}

function derivedOf(schema: PolicySchema, id: string) {
  return schema.derivedRows?.find((d) => d.id === id);
}

/** The switches that `op` does nothing without (`link.onlyWith`). */
function switchesOf(schema: PolicySchema, op: string): PolicyField[] {
  return fields(schema).filter((f) => f.kind === 'toggle' && f.link?.onlyWith?.includes(op));
}

/** The decision the value holds for row `op` — see {@link Decision}. */
export function decisionOf(schema: PolicySchema, value: PolicyValue, op: string): Decision {
  const gate = gateOf(schema, op);
  if (gate) return isEmpty(value[gate.key]) ? 'refused' : 'automatic';
  const made = derivedOf(schema, op);
  if (made) return made.requires.every((k) => !isEmpty(value[k])) ? 'automatic' : 'refused';
  const d = decisionFields(schema);
  if (!d) return 'refused';
  let decision: Decision;
  // A plain rule (the operation and nothing else) is what the table's columns
  // read: `ask` waits, `refuse` refuses. Conditional rules are shown below
  // the table and do not move the row.
  const plain = d.ask?.kind === 'rules' ? rulesOf(value[d.ask.key]).find((r) => r.when.op === op && isPlain(r)) : undefined;
  if (plain?.then === 'refuse') return 'refused';
  if (plain?.then === 'ask') decision = 'asked';
  else if (d.ask?.kind === 'choices' && chosen(value[d.ask.key]).includes(op)) decision = 'asked';
  else if (!d.allowed) decision = d.ask ? 'automatic' : 'refused';
  else {
    const allowed = chosen(value[d.allowed.key]);
    decision = (allowed.length === 0 ? d.allowed.emptyMeansAll === true : allowed.includes(op)) ? 'automatic' : 'refused';
  }
  // An operation that does nothing without its switch is refused while the switch is off.
  if (decision !== 'refused' && switchesOf(schema, op).some((t) => value[t.key] !== true)) return 'refused';
  return decision;
}

/**
 * `value` with row `op` decided as `decision`, through {@link change} so every
 * switch follows. Asking allows: `asked` ticks the operation among the allowed
 * ones. `automatic` keeps it allowed and drops the ask. `refused` unticks it,
 * which drops the ask too; a connector with no allowed-actions field cannot
 * refuse an operation, so `refused` there reads as `automatic`. A field row is
 * set to its `enable` value when allowed and cleared when refused; a derived
 * row is cleared when refused, and allowed only by setting its fields. A
 * switch the operation does nothing without is turned on with it, and off
 * when none of its operations is allowed any more.
 */
export function decide(schema: PolicySchema, value: PolicyValue, op: string, decision: Decision): PolicyValue {
  const gate = gateOf(schema, op);
  if (gate) {
    if (decision === 'refused') return isEmpty(value[gate.key]) ? value : change(schema, value, gate.key, undefined);
    return isEmpty(value[gate.key]) ? change(schema, value, gate.key, gate.row!.enable) : value;
  }
  const made = derivedOf(schema, op);
  if (made) {
    if (decision !== 'refused') return value;
    return made.requires.reduce((v, k) => (isEmpty(v[k]) ? v : change(schema, v, k, undefined)), value);
  }
  const d = decisionFields(schema);
  if (!d || (!d.ask && !d.allowed)) return value;
  const inOrder = (field: PolicyField, values: string[]) => (field.options ?? []).map((o) => o.value).filter((v) => values.includes(v));
  const without = (values: string[]) => {
    const kept = values.filter((v) => v !== op);
    return kept.length > 0 ? kept : undefined;
  };
  let next = value;
  if (d.ask?.kind === 'rules') {
    // The plain rule for `op` follows the column: asked → `ask`, last, after
    // the conditional rules it is the fallback of; otherwise none.
    const canAsk = d.ask.ruleSpec?.ops.some((o) => o.value === op) ?? false;
    const rules = rulesOf(next[d.ask.key]);
    const wanted = decision === 'asked' && canAsk ? withPlainRule(rules, op, 'ask') : withPlainRule(rules, op, null);
    if (JSON.stringify(wanted) !== JSON.stringify(rules)) next = { ...next, [d.ask.key]: wanted.length > 0 ? wanted : undefined };
  }
  const ask = d.ask?.kind === 'choices' && (d.ask.options ?? []).some((o) => o.value === op) ? d.ask : undefined;
  if (decision === 'asked' && ask) {
    const asked = chosen(next[ask.key]);
    if (!asked.includes(op)) next = change(schema, next, ask.key, inOrder(ask, [...asked, op]));
  } else if (ask) {
    const asked = chosen(next[ask.key]);
    if (asked.includes(op)) next = change(schema, next, ask.key, without(asked));
  }
  if (d.allowed) {
    const allowed = chosen(next[d.allowed.key]);
    const every = (d.allowed.options ?? []).map((o) => o.value);
    const allowsAll = allowed.length === 0 && d.allowed.emptyMeansAll === true;
    if (decision !== 'refused') {
      if (!allowsAll && !allowed.includes(op)) next = change(schema, next, d.allowed.key, inOrder(d.allowed, [...allowed, op]));
    } else if (allowsAll) {
      next = change(schema, next, d.allowed.key, every.filter((v) => v !== op));
    } else if (allowed.includes(op)) {
      next = change(schema, next, d.allowed.key, without(allowed));
    }
  }
  for (const t of switchesOf(schema, op)) {
    const others = (t.link?.onlyWith ?? []).filter((o) => o !== op && decisionOf(schema, next, o) !== 'refused');
    if (decision !== 'refused' && next[t.key] !== true) next = change(schema, next, t.key, true);
    else if (decision === 'refused' && next[t.key] === true && others.length === 0) next = { ...next, [t.key]: undefined };
  }
  return next;
}

// ==================== Rules ====================

/** The rules of a value, in order. */
export function rulesOf(v: PolicyValue[string]): PolicyRule[] {
  return Array.isArray(v) ? v.filter((r): r is PolicyRule => typeof r === 'object' && r !== null && 'when' in r) : [];
}

/** A rule's conditions: every member of `when` but the operation, set. */
export function conditionsOf(rule: PolicyRule): [string, string | number | string[]][] {
  return Object.entries(rule.when).filter(
    (e): e is [string, string | number | string[]] => e[0] !== 'op' && e[1] !== undefined && e[1] !== '' && !(Array.isArray(e[1]) && e[1].length === 0),
  );
}

/** A rule that names an operation and nothing else: what the table's columns read and write. */
export function isPlain(rule: PolicyRule): boolean {
  return conditionsOf(rule).length === 0;
}

const THENS: RuleThen[] = ['allow', 'ask', 'refuse'];

/**
 * What is wrong with `rules`, as the connector would refuse it: an operation
 * or an outcome it does not know, a condition the operation does not carry,
 * an amount that is not one, a range that matches nothing, an empty list. A
 * policy with any of these is unreadable to the connector, which refuses
 * everything but `status`.
 */
export function ruleProblems(spec: RuleSpec, rules: PolicyRule[]): string[] {
  const out: string[] = [];
  if (rules.length > spec.max) out.push(`Rules: ${rules.length} rules, at most ${spec.max}`);
  rules.forEach((rule, at) => {
    const n = at + 1;
    const op = rule.when?.op;
    if (!spec.ops.some((o) => o.value === op)) {
      out.push(`Rule ${n}: "${op}" is not an operation a rule can name`);
      return;
    }
    if (!THENS.includes(rule.then)) out.push(`Rule ${n}: "${rule.then}" is not an outcome`);
    for (const [key, v] of conditionsOf(rule)) {
      const c = spec.conditions.find((x) => x.key === key);
      if (!c) {
        out.push(`Rule ${n}: "${key}" is not a condition`);
      } else if (!c.ops.includes(op)) {
        out.push(`Rule ${n}: "${c.label.trim()}" does not apply to ${spec.ops.find((o) => o.value === op)?.label ?? op}`);
      } else if (c.kind === 'usd' && !(typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 1_000_000_000)) {
        out.push(`Rule ${n}: ${c.label.trim()} needs an amount of at least $0.01`);
      } else if (c.kind === 'set' && (!Array.isArray(v) || v.some((x) => !c.options?.some((o) => o.value === x)))) {
        out.push(`Rule ${n}: ${c.label.trim()} names something unknown`);
      } else if (c.kind === 'one' && !c.options?.some((o) => o.value === v)) {
        out.push(`Rule ${n}: ${c.label.trim()} names something unknown`);
      }
    }
    const min = rule.when.min_usd;
    const max = rule.when.max_usd;
    if (typeof min === 'number' && typeof max === 'number' && Math.round(min * 100) > Math.round(max * 100)) {
      out.push(`Rule ${n}: matches nothing — from $${min} is above up to $${max}`);
    }
    // A plain rule before another for the same operation decides every call
    // of it: the later one never runs.
    const earlier = rules.slice(0, at).findIndex((r) => r.when?.op === op && isPlain(r));
    if (earlier >= 0) out.push(`Rule ${n} never decides anything: rule ${earlier + 1} already decides every call of its operation`);
  });
  return out;
}

/** `rules` with the plain rule for `op` set to `then`, or removed with `null`. A new plain rule goes last, after the conditional ones it is the fallback of. */
export function withPlainRule(rules: PolicyRule[], op: string, then: RuleThen | null): PolicyRule[] {
  const kept = rules.filter((r) => !(r.when.op === op && isPlain(r)));
  return then ? [...kept, { when: { op }, then }] : kept;
}

/** Everything wrong with a value, in the owner's words. Empty when it can be saved. */
export function validate(schema: PolicySchema, value: PolicyValue): string[] {
  const errors: string[] = [];
  for (const f of fields(schema)) {
    const v = value[f.key];
    if (isEmpty(v)) continue;
    if (f.kind === 'list' && Array.isArray(v)) {
      for (const entry of chosen(v)) {
        const why = f.validateEntry?.(entry);
        if (why) errors.push(`${f.label}: ${why}`);
      }
    } else if (f.kind === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      const min = f.min ?? 1;
      if (!Number.isInteger(n) || n < min) errors.push(`${f.label}: a whole number of at least ${min}`);
    } else if (f.kind === 'rules' && f.ruleSpec) {
      errors.push(...ruleProblems(f.ruleSpec, rulesOf(v)));
    } else if (f.kind === 'choices' && Array.isArray(v)) {
      const known = new Set((f.options ?? []).map((o) => o.value));
      for (const entry of chosen(v)) if (!known.has(entry)) errors.push(`${f.label}: "${entry}" is not something this connector does`);
    }
  }
  for (const { toggle, link, choices } of links(schema)) {
    if (value[toggle.key] !== true || allowsAny(choices, chosen(value[link.key]), link.through)) continue;
    const names = link.through.map((c) => choices.options?.find((o) => o.value === c)?.label.replace(/ \(.*\)$/, '') ?? c);
    errors.push(
      `"${toggle.label}" is on, but ${names.map((n) => `"${n}"`).join(' or ')} is not ticked under ${choices.label} — the switch does nothing until it is`,
    );
  }
  errors.push(...(schema.check?.(value) ?? []));
  return errors;
}
