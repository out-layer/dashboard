'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import type { Choice, PolicyField, PolicySchema, PolicyValue } from '@/lib/policies/types';
import { change, decide, decisionFields, decisionOf, isUnrestricted, validate, type Decision } from '@/lib/policies/policy';

/**
 * One editor for every connector's policy, driven by its schema. The page it
 * draws is specified in `POLICY_DESIGN.md`; this header keeps the rules that
 * decide its shape.
 *
 * 1. **Every control is on the page.** Nothing folds away: a control a reader
 *    cannot see is a rule they do not know they set. Presets stay as one-click
 *    selections above the table they fill, never as a substitute for it.
 * 2. **The sentence comes first and is always live.** What the policy allows,
 *    said once at the top as the connector's `summarize` spells it, and
 *    recomputed on every change; a reader who reads nothing else reads that.
 *    Under it, the three rules every policy decides by.
 * 3. **Bounds, then decisions.** The groups that bound the agent — where, how
 *    much, the switches, the marker — come first, side by side on a wide
 *    screen. The decision table comes last, full width, one row per operation
 *    and three outcomes: refused (nothing ticked), automatic, or ask me first.
 *    An action asked about is an action allowed: ticking "Ask me first" moves
 *    it out of "Automatically", and refusing it drops the ask (`decide`).
 * 4. **The hierarchy is the section, then the field, then the default.** A
 *    numbered section title in the strongest weight, the field's label lighter,
 *    and what leaving it empty means in the faintest — printed under every
 *    empty field, not behind an (i). The (i) holds only the explanation.
 * 5. **The summary states permissions, never restrictions**, and an empty
 *    policy is described by the connector: `emptySummary` for a connector that
 *    fails closed or runs open, and "anyone, no limits" for one that narrows a
 *    consent already given.
 * 6. **Nothing is described that has not been loaded.** A caller that has not
 *    read the stored policy passes `headline`, and the editor says so instead
 *    of summarising a value it does not have.
 * 7. **A switch and the operations it qualifies move together** (`change`): a
 *    switch turned on ticks the operation it acts through, and unticking the
 *    operation turns the switch off.
 */
export function PolicyEditor({
  schema,
  value,
  onChange,
  disabled = false,
  headline,
}: {
  schema: PolicySchema;
  value: PolicyValue;
  onChange: (next: PolicyValue) => void;
  disabled?: boolean;
  /** Shown instead of the summary while the value is not the stored one — a
   *  page that has not loaded the policy must not describe it. */
  headline?: string;
}) {
  const summary = schema.summarize(value);
  const errors = validate(schema, value);
  const decision = decisionFields(schema);
  const bounds = schema.groups.filter((g) => g !== decision?.group);

  const set = (key: string, v: PolicyValue[string]) => onChange(change(schema, value, key, v));

  return (
    <div className="w-full space-y-6 text-sm" data-policy-editor>
      <div className="rounded-md border border-border bg-card-muted p-3">
        <p>
          <span className="font-medium">This policy: </span>
          {headline && isUnrestricted(value) ? (
            <span className="text-muted-foreground">{headline}</span>
          ) : isUnrestricted(value) ? (
            <span>{schema.emptySummary ?? 'anyone, no limits'}</span>
          ) : (
            <span>{summary}</span>
          )}
        </p>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="select-none hover:text-foreground">How a policy decides</summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Your settings decide first: the actions ticked, the limits typed, the switches turned on. The agent gets nothing wider.</li>
            <li>A field left empty falls to the connector’s own default for it, written under the field: no limit, any recipient, no attachments.</li>
            <li>
              {schema.emptyIsOpen
                ? 'Everything else is refused — except that with no policy at all, or an empty one, this connector runs fully open.'
                : 'Everything else is refused.'}
            </li>
            {decision && <li>“Ask me first” takes an allowed action and makes it wait for your yes in the inbox. An action asked about is an action allowed.</li>}
          </ol>
        </details>
      </div>

      {bounds.length > 0 && (
        <div className="grid gap-x-8 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
          {bounds.map((group, i) => (
            <section key={group.question} className="min-w-0 space-y-3">
              <SectionTitle n={i + 1}>{group.question}</SectionTitle>
              {group.fields.map((field) => (
                <Field key={field.key} field={field} value={value[field.key]} onChange={(v) => set(field.key, v)} disabled={disabled} />
              ))}
              {group.note && <p className="text-xs text-muted-foreground">{group.note}</p>}
            </section>
          ))}
        </div>
      )}

      {decision && (
        <section className="space-y-3">
          <SectionTitle n={bounds.length + 1}>{decision.group.question}</SectionTitle>
          {decision.group.fields
            .filter((f) => f !== decision.ask && f !== decision.allowed)
            .map((field) => (
              <Field key={field.key} field={field} value={value[field.key]} onChange={(v) => set(field.key, v)} disabled={disabled} />
            ))}
          <DecisionTable
            rows={decision.allowed ?? decision.ask}
            ask={decision.ask}
            allowed={decision.allowed}
            decisionOf={(op) => decisionOf(schema, value, op)}
            decide={(changes) => onChange(changes.reduce((v, [op, d]) => decide(schema, v, op, d), value))}
            clear={() => {
              const cleared = { ...value, [decision.ask.key]: undefined };
              if (decision.allowed) cleared[decision.allowed.key] = undefined;
              onChange(cleared);
            }}
            disabled={disabled}
          />
          {decision.group.note && <p className="text-xs text-muted-foreground">{decision.group.note}</p>}
        </section>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A numbered section title: the numeral is the eye's anchor, the question is the strongest text in the section. */
function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-[11px] font-semibold tabular-nums text-muted-foreground">
        {n}
      </span>
      {children}
    </h3>
  );
}

const INPUT = 'rounded-md border border-border-strong px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50';

function isEmpty(v: PolicyValue[string]): boolean {
  return v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
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
  const hint = <InfoHint text={field.help} />;
  const absent = isEmpty(value) && <p className="text-xs text-faint-foreground">{field.absentMeans}</p>;
  // A switch is one line: the box, its name, the (i); what "off" means under it while it is off.
  if (field.kind === 'toggle') {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} disabled={disabled} />
            <span>{field.label}</span>
          </label>
          {hint}
        </div>
        {absent && <div className="pl-6">{absent}</div>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span>{field.label}</span>
        {hint}
      </label>
      {field.kind === 'list' ? (
        <ListInput field={field} entries={Array.isArray(value) ? value : []} onChange={onChange} disabled={disabled} />
      ) : field.kind === 'choices' ? (
        <ChoicesTable field={field} chosen={Array.isArray(value) ? value : []} onChange={onChange} disabled={disabled} />
      ) : field.kind === 'number' ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={field.min ?? 1}
            step={1}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            disabled={disabled}
            className={`w-28 tabular-nums ${INPUT}`}
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
          className={`w-full max-w-xs ${INPUT}`}
        />
      )}
      {absent}
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
            <span key={entry} className="inline-flex items-center gap-1 rounded border border-border bg-card-muted px-2 py-0.5 font-mono text-xs">
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
        className={`w-full max-w-xs ${INPUT}`}
      />
    </div>
  );
}

/** One-click selections above a table: what most owners mean. The table stays. */
function Presets({
  field,
  chosen,
  put,
  clear,
  disabled,
}: {
  field: PolicyField;
  chosen: string[];
  put: (values: string[]) => void;
  clear: () => void;
  disabled: boolean;
}) {
  if (!field.presets?.length) return null;
  const same = (values: string[]) => values.length === chosen.length && values.every((v) => chosen.includes(v));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Start from:</span>
      {field.presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => put(preset.values)}
          disabled={disabled}
          aria-pressed={same(preset.values)}
          className={`rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 ${
            same(preset.values) ? 'border-accent bg-accent/10 text-accent-text' : 'border-border-strong text-muted-foreground hover:border-accent hover:text-accent-text'
          }`}
        >
          {preset.label}
        </button>
      ))}
      {chosen.length > 0 && (
        <button type="button" onClick={clear} disabled={disabled} className="px-1 text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50">
          clear
        </button>
      )}
    </div>
  );
}

const TH = 'pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground';

/** The groups of a vocabulary, in its order, each as a small table; the tables flow into columns on a wide screen. */
function groupsOf(options: Choice[]): { name: string; rows: Choice[] }[] {
  const names = [...new Set(options.map((o) => o.group))];
  return names.map((name) => ({ name, rows: options.filter((o) => o.group === name) }));
}

/**
 * The decision table: one row per operation, one column per outcome. A row
 * with nothing ticked is refused; "Automatically" and "Ask me first" exclude
 * each other, so a tick in one moves the row out of the other. Rows the
 * connector cannot ask about (reads) have no "Ask me first" box. A connector
 * with no allowed-actions field (Gmail) allows every row by default, so each
 * row is a pair of radios: automatic, or asked.
 */
function DecisionTable({
  rows,
  ask,
  allowed,
  decisionOf,
  decide,
  clear,
  disabled,
}: {
  rows: PolicyField;
  ask: PolicyField;
  allowed?: PolicyField;
  decisionOf: (op: string) => Decision;
  /** Several rows decided at once, each on the value the one before produced. */
  decide: (changes: [string, Decision][]) => void;
  clear: () => void;
  disabled: boolean;
}) {
  const options = rows.options ?? [];
  const askable = new Set((ask.options ?? []).map((o) => o.value));
  const chosen = options.map((o) => o.value).filter((v) => decisionOf(v) !== 'refused');
  const one = (op: string, d: Decision) => decide([[op, d]]);
  // A preset names what runs automatically; what it does not name is refused, asks included.
  const put = (values: string[]) => decide(options.map((o) => [o.value, values.includes(o.value) ? 'automatic' : 'refused']));

  const label = (o: Choice) => o.label.replace(/ \(.*\)$/, '');
  const columnTitle = (d: Decision) => (d === 'automatic' ? 'Automatically' : 'Ask me first');
  // With no allowed-actions field every row runs by default, and what that means is the ask field's `absentMeans`.
  const columnHelp = (d: Decision) => (d === 'automatic' ? (allowed ? allowed.help : ask.absentMeans) : ask.help);

  return (
    <div className="space-y-3">
      {allowed && (
        <Presets field={allowed} chosen={chosen} put={put} clear={clear} disabled={disabled} />
      )}
      <div className="gap-8 md:columns-2 xl:columns-3">
        {groupsOf(options).map((group) => (
          <table key={group.name} className="mb-4 w-full break-inside-avoid border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={`${TH} text-left`}>
                  {group.name}
                </th>
                {(['automatic', 'asked'] as Decision[]).map((d) => (
                  <th key={d} scope="col" className={`${TH} w-24 text-center`}>
                    <span className="inline-flex items-center gap-1">
                      {columnTitle(d)}
                      <InfoHint text={columnHelp(d)} align="right" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((o) => {
                const now = decisionOf(o.value);
                const canAsk = askable.has(o.value);
                const radios = !allowed;
                return (
                  <tr key={o.value} className="border-b border-border/60 last:border-0 hover:bg-card-muted/60">
                    <td className="py-1.5 pr-2" title={o.value}>
                      {label(o)}
                    </td>
                    <td className="py-1.5 text-center">
                      <input
                        type={radios ? 'radio' : 'checkbox'}
                        name={radios ? `${ask.key}:${o.value}` : undefined}
                        aria-label={`${label(o)}: automatically`}
                        checked={now === 'automatic'}
                        onChange={() => one(o.value, now === 'automatic' && !radios ? 'refused' : 'automatic')}
                        disabled={disabled}
                      />
                    </td>
                    <td className="py-1.5 text-center">
                      {canAsk ? (
                        <input
                          type={radios ? 'radio' : 'checkbox'}
                          name={radios ? `${ask.key}:${o.value}` : undefined}
                          aria-label={`${label(o)}: ask me first`}
                          checked={now === 'asked'}
                          onChange={() => one(o.value, now === 'asked' && !radios ? 'automatic' : 'asked')}
                          disabled={disabled}
                        />
                      ) : (
                        <span className="text-faint-foreground" title="Cannot wait for you: it changes nothing">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {group.rows.length > 1 && allowed && (
                <tr>
                  <td className="pt-1 text-xs text-faint-foreground">whole group</td>
                  <td className="pt-1 text-center">
                    <GroupAll
                      title={`All of ${group.name.toLowerCase()}: automatically`}
                      state={groupState(group.rows, decisionOf, 'automatic')}
                      onSet={(on) => decide(group.rows.map((o) => [o.value, on ? 'automatic' : 'refused']))}
                      disabled={disabled}
                    />
                  </td>
                  <td className="pt-1 text-center">
                    {group.rows.some((o) => askable.has(o.value)) && (
                      <GroupAll
                        title={`All of ${group.name.toLowerCase()}: ask me first`}
                        state={groupState(group.rows.filter((o) => askable.has(o.value)), decisionOf, 'asked')}
                        onSet={(on) => decide(group.rows.filter((o) => askable.has(o.value)).map((o) => [o.value, on ? 'asked' : 'automatic']))}
                        disabled={disabled}
                      />
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

function groupState(rows: Choice[], decisionOf: (op: string) => Decision, d: Decision): 'all' | 'some' | 'none' {
  const n = rows.filter((o) => decisionOf(o.value) === d).length;
  return n === 0 ? 'none' : n === rows.length ? 'all' : 'some';
}

/** The whole-group box: ticked when every row is, indeterminate when some are. */
function GroupAll({ title, state, onSet, disabled }: { title: string; state: 'all' | 'some' | 'none'; onSet: (on: boolean) => void; disabled: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={title}
      title={title}
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onChange={() => onSet(state !== 'all')}
      disabled={disabled}
    />
  );
}

/** A set from a fixed vocabulary with no owner to ask: one "Allowed" column, the same table otherwise. */
function ChoicesTable({
  field,
  chosen,
  onChange,
  disabled,
}: {
  field: PolicyField;
  chosen: string[];
  onChange: (v: string[] | undefined) => void;
  disabled: boolean;
}) {
  const options = field.options ?? [];
  const put = (values: string[]) => {
    const next = options.map((o) => o.value).filter((v) => values.includes(v));
    onChange(next.length ? next : undefined);
  };
  const toggle = (value: string) => put(chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]);
  const groups = groupsOf(options);
  const wide = groups.length > 1;
  return (
    <div className="space-y-2">
      <Presets field={field} chosen={chosen} put={put} clear={() => onChange(undefined)} disabled={disabled} />
      <div className={wide ? 'gap-8 md:columns-2' : ''}>
        {groups.map((group) => (
          <table key={group.name} className={`mb-2 break-inside-avoid border-collapse text-sm ${wide ? 'w-full' : 'w-full max-w-xs'}`}>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={`${TH} text-left`}>
                  {group.name}
                </th>
                <th scope="col" className={`${TH} w-20 text-center`}>
                  Allowed
                </th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((o) => (
                <tr key={o.value} className="border-b border-border/60 last:border-0 hover:bg-card-muted/60">
                  <td className="py-1.5 pr-2" title={o.value}>
                    {o.label.replace(/ \(.*\)$/, '')}
                  </td>
                  <td className="py-1.5 text-center">
                    <input type="checkbox" aria-label={`${o.label}: allowed`} checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} disabled={disabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
