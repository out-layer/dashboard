'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import type { PolicyField, PolicySchema, PolicyValue } from '@/lib/policies/types';
import { isUnrestricted, validate } from '@/lib/policies/policy';

/**
 * One editor for every connector's policy, driven by its schema.
 *
 * A policy names what an agent may do with somebody's bank, mailbox or trading
 * account, and the person setting it is not reading a reference manual. Four
 * decisions follow from that, and a new connector's schema inherits them for
 * free — write `lib/policies/<connector>.ts` and this renders it.
 *
 * 1. **Closed, it is one line**: what the policy allows, as a sentence, and a
 *    way to change it. A form of eight fields, open by default, reads as work
 *    to be done and gets skipped.
 * 2. **The summary states permissions, never restrictions.** Every field is a
 *    narrowing of a consent already given, so an empty policy allows
 *    everything — and a page that renders empty fields silently lets the reader
 *    conclude the opposite. Under each empty field, `absentMeans` says what
 *    leaving it empty permits.
 * 3. **The sentence stays under the fields while editing**, so what is read
 *    back is the consequence of the change rather than the field that changed.
 * 4. **Nothing is described that has not been loaded.** A caller that has not
 *    read the stored policy passes `headline`, and the editor says so instead
 *    of summarising a value it does not have.
 */
export function PolicyEditor({
  schema,
  value,
  onChange,
  disabled = false,
  defaultOpen = false,
  headline,
}: {
  schema: PolicySchema;
  value: PolicyValue;
  onChange: (next: PolicyValue) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
  /** Shown instead of the summary while the value is not the stored one — a
   *  page that has not loaded the policy must not describe it. */
  headline?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = schema.summarize(value);
  const errors = validate(schema, value);

  const set = (key: string, v: PolicyValue[string]) => onChange({ ...value, [key]: v });

  return (
    <div className="rounded border border-gray-200 text-sm">
      <div className="flex items-start justify-between gap-3 p-3">
        <div>
          <span className="font-medium">Policy: </span>
          {headline && isUnrestricted(value) ? (
            <span className="text-muted-foreground">{headline}</span>
          ) : isUnrestricted(value) ? (
            <span className="font-medium">anyone, no limits</span>
          ) : (
            <span>{summary}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled}
          className="shrink-0 text-xs underline text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {open ? 'Hide' : 'Customize'}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-200 p-3 space-y-4">
          {schema.groups.map((group) => (
            <fieldset key={group.question} className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.question}</legend>
              {group.fields.map((field) => (
                <Field key={field.key} field={field} value={value[field.key]} onChange={(v) => set(field.key, v)} disabled={disabled} />
              ))}
            </fieldset>
          ))}
          {errors.length > 0 && (
            <ul className="space-y-1 text-xs text-red-600">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <p className="border-t border-gray-100 pt-3 text-xs text-muted-foreground">{summary}</p>
        </div>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  disabled,
}: {
  field: PolicyField;
  value: PolicyValue[string];
  onChange: (v: PolicyValue[string]) => void;
  disabled: boolean;
}) {
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-sm">
        <span>{field.label}</span>
        <InfoHint text={field.help} />
      </label>
      {field.kind === 'list' ? (
        <ListInput field={field} entries={Array.isArray(value) ? value : []} onChange={onChange} disabled={disabled} />
      ) : field.kind === 'number' ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={field.min ?? 1}
            step={1}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            disabled={disabled}
            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          />
          {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
        </div>
      ) : (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          disabled={disabled}
          className="w-full max-w-xs rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
        />
      )}
      {empty && <p className="text-xs text-muted-foreground">{field.absentMeans}</p>}
    </div>
  );
}

/** A list of short entries as chips; type one and press Enter or a comma. */
function ListInput({
  field,
  entries,
  onChange,
  disabled,
}: {
  field: PolicyField;
  entries: string[];
  onChange: (v: string[] | undefined) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');

  const commit = (text: string) => {
    const added = text
      .split(/[,\n]/)
      .map((e) => (field.normalize ?? ((s) => s.trim()))(e))
      .filter((e) => e.length > 0 && !entries.includes(e));
    if (added.length) onChange([...entries, ...added]);
    setDraft('');
  };
  const remove = (entry: string) => {
    const next = entries.filter((e) => e !== entry);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="space-y-1">
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entries.map((entry) => (
            <span key={entry} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs">
              {entry}
              <button
                type="button"
                aria-label={`Remove ${entry}`}
                onClick={() => remove(entry)}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        placeholder={field.placeholder}
        disabled={disabled}
        onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        className="w-full max-w-xs rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
      />
    </div>
  );
}
