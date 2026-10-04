import type { PolicyField, PolicyGroup, PolicySchema, PolicyValue, SwitchLink } from './types';

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
    out[f.key] = v;
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
    if (f.kind === 'list' || f.kind === 'choices') {
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

function chosen(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v : [];
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
 *   preset, cleared) turn the switch off.
 */
export function change(schema: PolicySchema, value: PolicyValue, key: string, v: PolicyValue[string]): PolicyValue {
  // An action asked about is an action allowed (`asksBefore`): ticked under
  // "Ask me before", it is ticked among the allowed actions too — and that
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

/**
 * The schema's decision table: the field listing what waits for the owner
 * (`asks`), the field listing what is allowed (`asksBefore`) when the connector
 * has one, and the group they share. Null for a connector with nothing to ask.
 */
export function decisionFields(schema: PolicySchema): { ask: PolicyField; allowed?: PolicyField; group: PolicyGroup } | null {
  for (const group of schema.groups) {
    const ask = group.fields.find((f) => f.kind === 'choices' && f.asks);
    if (!ask) continue;
    const allowed = ask.asksBefore ? fields(schema).find((f) => f.key === ask.asksBefore && f.kind === 'choices') : undefined;
    return { ask, allowed, group };
  }
  return null;
}

/** The decision the value holds for `op` — see {@link Decision}. */
export function decisionOf(schema: PolicySchema, value: PolicyValue, op: string): Decision {
  const d = decisionFields(schema);
  if (!d) return 'refused';
  if (chosen(value[d.ask.key]).includes(op)) return 'asked';
  if (!d.allowed) return 'automatic';
  const allowed = chosen(value[d.allowed.key]);
  if (allowed.length === 0) return d.allowed.emptyMeansAll ? 'automatic' : 'refused';
  return allowed.includes(op) ? 'automatic' : 'refused';
}

/**
 * `value` with `op` decided as `decision`, through {@link change} so every
 * switch follows. Asking allows: `asked` ticks the operation among the allowed
 * ones. `automatic` keeps it allowed and drops the ask. `refused` unticks it,
 * which drops the ask too; a connector with no allowed-actions field cannot
 * refuse here, so `refused` there reads as `automatic`.
 */
export function decide(schema: PolicySchema, value: PolicyValue, op: string, decision: Decision): PolicyValue {
  const d = decisionFields(schema);
  if (!d) return value;
  const inOrder = (field: PolicyField, values: string[]) => (field.options ?? []).map((o) => o.value).filter((v) => values.includes(v));
  const without = (field: PolicyField, values: string[]) => {
    const kept = values.filter((v) => v !== op);
    return kept.length > 0 ? kept : undefined;
  };
  const asked = chosen(value[d.ask.key]);
  if (decision === 'asked') {
    return asked.includes(op) ? value : change(schema, value, d.ask.key, inOrder(d.ask, [...asked, op]));
  }
  let next = asked.includes(op) ? change(schema, value, d.ask.key, without(d.ask, asked)) : value;
  if (!d.allowed) return next;
  const allowed = chosen(next[d.allowed.key]);
  const every = (d.allowed.options ?? []).map((o) => o.value);
  const allowsAll = allowed.length === 0 && d.allowed.emptyMeansAll === true;
  if (decision === 'automatic') {
    if (!allowsAll && !allowed.includes(op)) next = change(schema, next, d.allowed.key, inOrder(d.allowed, [...allowed, op]));
  } else if (allowsAll) {
    next = change(schema, next, d.allowed.key, every.filter((v) => v !== op));
  } else if (allowed.includes(op)) {
    next = change(schema, next, d.allowed.key, without(d.allowed, allowed));
  }
  return next;
}

/** Everything wrong with a value, in the owner's words. Empty when it can be saved. */
export function validate(schema: PolicySchema, value: PolicyValue): string[] {
  const errors: string[] = [];
  for (const f of fields(schema)) {
    const v = value[f.key];
    if (isEmpty(v)) continue;
    if (f.kind === 'list' && Array.isArray(v)) {
      for (const entry of v) {
        const why = f.validateEntry?.(entry);
        if (why) errors.push(`${f.label}: ${why}`);
      }
    } else if (f.kind === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      const min = f.min ?? 1;
      if (!Number.isInteger(n) || n < min) errors.push(`${f.label}: a whole number of at least ${min}`);
    } else if (f.kind === 'choices' && Array.isArray(v)) {
      const known = new Set((f.options ?? []).map((o) => o.value));
      for (const entry of v) if (!known.has(entry)) errors.push(`${f.label}: "${entry}" is not something this connector does`);
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
