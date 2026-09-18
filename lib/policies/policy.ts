import type { PolicyField, PolicySchema, PolicyValue } from './types';

/** Every field of the schema, flat. */
export function fields(schema: PolicySchema): PolicyField[] {
  return schema.groups.flatMap((g) => g.fields);
}

function isEmpty(v: PolicyValue[string]): boolean {
  return v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
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
    if (f.kind === 'list') {
      value[k] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
    } else if (f.kind === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n)) value[k] = n;
    } else {
      value[k] = String(raw);
    }
  }
  return { value, unknownKeys };
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
    }
  }
  return errors;
}
