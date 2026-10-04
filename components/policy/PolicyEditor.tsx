'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import type { Choice, PolicyField, PolicySchema, PolicyValue } from '@/lib/policies/types';
import { change, decide, decisionFields, decisionOf, fields, isUnrestricted, shownAsRows, validate, type Decision, type DecisionRow } from '@/lib/policies/policy';

function isEmptyValue(v: PolicyValue[string]): boolean {
  return v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

/**
 * One editor for every connector's policy, driven by its schema. The page it
 * draws is specified in `POLICY_DESIGN.md`; this header keeps the rules that
 * decide its shape.
 *
 * 1. **Every control is on the page.** Nothing folds away: a control a reader
 *    cannot see is a rule they do not know they set.
 * 2. **The sentence comes first and is always live.** What the policy allows,
 *    said once at the top as the connector's `summarize` spells it, and
 *    recomputed on every change; a reader who reads nothing else reads that.
 *    Under it, closed, the rules every policy decides by.
 * 3. **What, then where.** The decision table comes first, full width: one row
 *    per operation, two outcomes — auto-approve, manual approval — and nothing
 *    ticked is refused. An action asked about is an action allowed (`decide`).
 *    A table whose rows cannot wait for the owner (reads) has no manual column.
 *    A group's name is the switch for the whole group: one click turns every
 *    row of it on, the next turns them all off. The limits come after, side by
 *    side on a wide screen.
 * 4. **The hierarchy is the section, then the field.** A numbered section title
 *    in the strongest weight, the field's label lighter. What a field does and
 *    what leaving it empty means are in its (i); the sentence at the top says
 *    the consequence of every empty field that matters, and `check` refuses a
 *    combination that cannot work.
 * 5. **The two outcome columns are told apart by a faint tint** — success for
 *    auto-approve, info for manual approval — the same on every connector.
 * 6. **The summary states permissions, never restrictions**, and an empty
 *    policy is described by the connector (`emptySummary`). A caller that has
 *    not read the stored policy passes `notLoaded`: an untouched form then has
 *    no sentence — it would describe a value nobody has — and the page's own
 *    load button and Save warning say the rest.
 * 7. **A switch and the operations it qualifies move together** (`change`).
 */
export function PolicyEditor({
  schema,
  value,
  onChange,
  disabled = false,
  notLoaded = false,
}: {
  schema: PolicySchema;
  value: PolicyValue;
  onChange: (next: PolicyValue) => void;
  disabled?: boolean;
  /** The value is not the stored one: an untouched form is not described. */
  notLoaded?: boolean;
}) {
  const summary = schema.summarize(value);
  const untouched = notLoaded && isUnrestricted(value);
  const errors = validate(schema, value);
  const decision = decisionFields(schema);
  // A switch shown as a row is that row; a number with one keeps its input here.
  const inTable = (f: PolicyField) => f === decision?.ask || f === decision?.allowed || shownAsRows(f);
  // A connector that runs open with no policy shows its default as allowed, and
  // the first change starts the owner's own rules from `ownStart` — never from
  // nothing, which would switch off what the owner did not touch.
  const openDefault = schema.emptyIsOpen === true && isUnrestricted(value);
  const base = openDefault ? { ...(schema.ownStart ?? {}) } : value;
  const labelOf = (key: string) => fields(schema).find((f) => f.key === key)?.label ?? key;
  const goTo = (key: string) => {
    const el = document.getElementById(`policy-field-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('input')?.focus({ preventScroll: true });
  };
  const bounds = schema.groups
    .filter((g) => g !== decision?.group)
    .map((g) => ({ ...g, fields: g.fields.filter((f) => !inTable(f)) }))
    .filter((g) => g.fields.length > 0);

  const set = (key: string, v: PolicyValue[string]) => onChange(change(schema, base, key, v));

  return (
    <div className="w-full space-y-6 text-sm" data-policy-editor>
      <div className={untouched ? '' : 'rounded-md border border-border bg-card-muted p-3'}>
        {!untouched && (
          <p className="mb-2">
            <span className="font-medium">This policy: </span>
            {isUnrestricted(value) ? <span>{schema.emptySummary ?? 'anyone, no limits'}</span> : <span>{summary}</span>}
          </p>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="select-none hover:text-foreground">How a policy decides</summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Your settings decide first: the actions ticked, the limits typed, the switches turned on. The agent gets nothing wider.</li>
            <li>A field left empty falls to the connector’s own default for it, said in the field’s (i): no limit, any recipient, no attachments.</li>
            <li>
              {schema.emptyIsOpen
                ? 'Everything else is refused — except that with no policy at all, or an empty one, this connector runs fully open.'
                : 'Everything else is refused.'}
            </li>
            {decision?.ask && <li>Manual approval takes an allowed action and makes it wait for your yes in the inbox. An action that needs your approval is an action allowed.</li>}
          </ol>
        </details>
      </div>

      {decision && (
        <section className="space-y-3">
          <SectionTitle n={1}>{decision.group?.question ?? 'What may it do?'}</SectionTitle>
          {(decision.group?.note ?? schema.decisionNote) && <p className="text-xs text-muted-foreground">{decision.group?.note ?? schema.decisionNote}</p>}
          {schema.emptyIsOpen &&
            (openDefault ? (
              <p className="max-w-3xl text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Built-in default:</span> everything here runs, with no caps. Change anything to set
                your own rules — orders then need their limits.
              </p>
            ) : (
              <button type="button" onClick={() => onChange({})} disabled={disabled} className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50">
                Back to the built-in default
              </button>
            ))}
          {(decision.group?.fields ?? [])
            .filter((f) => !inTable(f))
            .map((field) => (
              <Field key={field.key} field={field} value={value[field.key]} onChange={(v) => set(field.key, v)} disabled={disabled} />
            ))}
          <DecisionTable
            rows={decision.rows}
            radioName={decision.ask?.key ?? 'decision'}
            decisionOf={(op) => (openDefault ? 'automatic' : decisionOf(schema, value, op))}
            decide={(changes) => onChange(changes.reduce((v, [op, d]) => decide(schema, v, op, d), base))}
            missing={(row) => (openDefault ? [] : row.needs.filter((k) => isEmptyValue(value[k])))}
            labelOf={labelOf}
            goTo={goTo}
            disabled={disabled}
          />
        </section>
      )}

      {bounds.length > 0 && (
        <div className="grid gap-x-8 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
          {bounds.map((group, i) => (
            <section key={group.question} className="min-w-0 space-y-3">
              <SectionTitle n={i + (decision ? 2 : 1)}>{group.question}</SectionTitle>
              {group.fields.map((field) => (
                <Field key={field.key} field={field} value={value[field.key]} onChange={(v) => set(field.key, v)} disabled={disabled} />
              ))}
              {group.note && <p className="text-xs text-muted-foreground">{group.note}</p>}
            </section>
          ))}
        </div>
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
  const hint = (
    <InfoHint
      text={
        <>
          <span className="block">{field.help}</span>
          <span className="mt-2 block border-t border-border pt-2">
            <strong className="font-medium text-foreground">Left empty:</strong> {field.absentMeans}
          </span>
        </>
      }
    />
  );
  // A switch is one line: the box, its name, the (i).
  if (field.kind === 'toggle') {
    return (
      <div id={`policy-field-${field.key}`} className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} disabled={disabled} />
            <span>{field.label}</span>
          </label>
          {hint}
        </div>
      </div>
    );
  }
  return (
    <div id={`policy-field-${field.key}`} className="space-y-1">
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
    </div>
  );
}


/**
 * A list of short entries as one box: the entries as chips, and at their end
 * the place to type the next one. Enter, a comma or a space adds it; a pasted
 * list — commas, spaces or lines between — adds every entry at once. No entry
 * any connector accepts holds a space. A long list scrolls inside the box, and
 * its count and a way to clear it show from a handful on.
 */
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
      .split(/[\s,]+/)
      .map((e) => (field.normalize ?? ((s) => s.trim()))(e))
      .filter((e, i, all) => e.length > 0 && !entries.includes(e) && all.indexOf(e) === i);
    if (added.length) onChange([...entries, ...added]);
    setDraft('');
  };
  const remove = (entry: string) => {
    const next = entries.filter((e) => e !== entry);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="space-y-1">
      <div
        className={`flex max-h-32 flex-wrap items-center gap-1 overflow-y-auto rounded-md border border-border-strong px-1.5 py-1 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent ${disabled ? 'opacity-50' : ''}`}
        title="Type and press Enter. A pasted list — commas, spaces or lines between — adds every entry."
      >
        {entries.map((entry) => (
          <span key={entry} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-card-muted px-1.5 py-0.5 font-mono text-xs">
            <span className="truncate">{entry}</span>
            <button
              type="button"
              aria-label={`Remove ${entry}`}
              onClick={() => remove(entry)}
              disabled={disabled}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          aria-label={field.label}
          placeholder={entries.length === 0 ? field.placeholder : 'add…'}
          disabled={disabled}
          onChange={(e) => (/[\s,]/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && draft === '' && entries.length > 0) {
              remove(entries[entries.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          className="min-w-[6rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {entries.length >= 5 && (
        <p className="text-xs text-faint-foreground">
          <span className="tabular-nums">{entries.length}</span> entries ·{' '}
          <button type="button" onClick={() => onChange(undefined)} disabled={disabled} className="underline hover:text-foreground">
            clear all
          </button>
        </p>
      )}
    </div>
  );
}

const TH = 'pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground';
/** The two outcomes, told apart by a faint tint of their meaning — the same on every connector. */
const AUTO_TINT = 'bg-success/[0.07]';
const MANUAL_TINT = 'bg-info/[0.08]';

/** The groups of a vocabulary, in its order. */
function groupsOf(options: Choice[]): { name: string; rows: Choice[] }[] {
  const names = [...new Set(options.map((o) => o.group))];
  return names.map((name) => ({ name, rows: options.filter((o) => o.group === name) }));
}

/**
 * A group's name as its switch: one click turns every row of the group on,
 * the next — once all are on — turns them all off. It shows how many are on.
 */
function GroupSwitch({ name, on, of, toggle, disabled }: { name: string; on: number; of: number; toggle: () => void; disabled: boolean }) {
  const all = on === of;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={all}
      title={all ? `Turn off all of ${name.toLowerCase()}` : `Turn on all of ${name.toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider disabled:opacity-50 ${
        all
          ? 'border-accent bg-accent/10 text-accent-text'
          : on > 0
            ? 'border-accent/50 border-dashed text-foreground hover:border-accent'
            : 'border-border-strong text-muted-foreground hover:border-accent hover:text-accent-text'
      }`}
    >
      {name}
      <span className="font-normal normal-case tracking-normal tabular-nums">
        {on}/{of}
      </span>
    </button>
  );
}

/**
 * The decision table: one small table per group of rows, two outcome columns.
 * A row with nothing ticked is refused; auto-approve and manual approval
 * exclude each other. A row that cannot be refused (Gmail's send: the
 * connector has no list of allowed operations) is a pair of radios. A group
 * none of whose rows can wait for the owner (reads) has no manual column. A
 * group's name is its switch when every row of it can be refused.
 */
function DecisionTable({
  rows,
  radioName,
  decisionOf,
  decide,
  missing,
  labelOf,
  goTo,
  disabled,
}: {
  rows: DecisionRow[];
  radioName: string;
  decisionOf: (op: string) => Decision;
  /** Several rows decided at once, each on the value the one before produced. */
  decide: (changes: [string, Decision][]) => void;
  /** The fields a row still needs set before it runs. */
  missing: (row: DecisionRow) => string[];
  labelOf: (key: string) => string;
  goTo: (key: string) => void;
  disabled: boolean;
}) {
  const one = (op: string, d: Decision) => decide([[op, d]]);
  const label = (r: DecisionRow) => r.label.replace(/ \(.*\)$/, '');
  const groups = [...new Set(rows.map((r) => r.group))].map((name) => ({ name, rows: rows.filter((r) => r.group === name) }));

  return (
    <div className="gap-8 md:columns-2 xl:columns-3">
      {groups.map((group) => {
        const manual = group.rows.some((r) => r.askable);
        const switchable = group.rows.every((r) => r.refusable && !r.derived);
        const on = group.rows.filter((r) => decisionOf(r.id) !== 'refused').length;
        return (
          <table key={group.name} className="mb-4 w-full break-inside-avoid border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="pb-1.5 text-left">
                  {switchable && group.rows.length > 1 ? (
                    <GroupSwitch
                      name={group.name}
                      on={on}
                      of={group.rows.length}
                      // Turning a group on keeps the rows that wait for the owner waiting.
                      toggle={() =>
                        decide(
                          on === group.rows.length
                            ? group.rows.map((r) => [r.id, 'refused'])
                            : group.rows.filter((r) => decisionOf(r.id) === 'refused').map((r) => [r.id, 'automatic']),
                        )
                      }
                      disabled={disabled}
                    />
                  ) : (
                    <span className={TH}>{group.name}</span>
                  )}
                </th>
                <th scope="col" className={`${TH} ${AUTO_TINT} w-20 rounded-t px-1 text-center`}>
                  Auto-approve
                </th>
                {manual && (
                  <th scope="col" className={`${TH} ${MANUAL_TINT} w-20 rounded-t px-1 text-center`}>
                    Manual approval
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const now = decisionOf(r.id);
                const radios = !r.refusable;
                const lacking = missing(r);
                // A derived row is ticked by setting its fields: off, it offers the way there.
                const settable = r.derived && now === 'refused';
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-2" title={r.help ?? r.id}>
                      {label(r)}
                      {lacking.length > 0 && (now !== 'refused' || r.derived) && (
                        <span className="block text-xs text-faint-foreground">
                          runs once{' '}
                          {lacking.map((k, i) => (
                            <span key={k}>
                              {i > 0 && (i === lacking.length - 1 ? ' and ' : ', ')}
                              <button type="button" onClick={() => goTo(k)} className="underline hover:text-foreground">
                                {labelOf(k)}
                              </button>
                            </span>
                          ))}{' '}
                          {lacking.length === 1 ? 'is' : 'are'} set
                        </span>
                      )}
                    </td>
                    <td className={`${AUTO_TINT} py-1.5 text-center`}>
                      {settable ? (
                        <button
                          type="button"
                          onClick={() => lacking[0] && goTo(lacking[0])}
                          disabled={disabled}
                          title="Set its limits below"
                          aria-label={`${label(r)}: set its limits`}
                          className="text-xs text-accent-text hover:underline disabled:opacity-50"
                        >
                          set ↓
                        </button>
                      ) : (
                        <input
                          type={radios ? 'radio' : 'checkbox'}
                          name={radios ? `${radioName}:${r.id}` : undefined}
                          aria-label={`${label(r)}: auto-approve`}
                          checked={now === 'automatic'}
                          onChange={() => one(r.id, now === 'automatic' && !radios ? 'refused' : 'automatic')}
                          disabled={disabled}
                        />
                      )}
                    </td>
                    {manual && (
                      <td className={`${MANUAL_TINT} py-1.5 text-center`}>
                        {r.askable ? (
                          <input
                            type={radios ? 'radio' : 'checkbox'}
                            name={radios ? `${radioName}:${r.id}` : undefined}
                            aria-label={`${label(r)}: manual approval`}
                            checked={now === 'asked'}
                            onChange={() => one(r.id, now === 'asked' && !radios ? 'automatic' : 'asked')}
                            disabled={disabled}
                          />
                        ) : (
                          <span className="text-faint-foreground" title="Cannot wait for you on its own">
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/** A set from a fixed vocabulary with no owner to ask: one "Allowed" column, each group's name its switch. */
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
    <div className={wide ? 'gap-8 md:columns-2' : ''}>
      {groups.map((group) => {
        const values = group.rows.map((o) => o.value);
        const on = values.filter((v) => chosen.includes(v)).length;
        return (
          <table key={group.name} className={`mb-2 break-inside-avoid border-collapse text-sm ${wide ? 'w-full' : 'w-full max-w-xs'}`}>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="pb-1.5 text-left">
                  <GroupSwitch
                    name={group.name}
                    on={on}
                    of={values.length}
                    toggle={() => put(on === values.length ? chosen.filter((v) => !values.includes(v)) : [...chosen, ...values])}
                    disabled={disabled}
                  />
                </th>
                <th scope="col" className={`${TH} ${AUTO_TINT} w-20 rounded-t px-1 text-center`}>
                  Allowed
                </th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((o) => (
                <tr key={o.value} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2" title={o.value}>
                    {o.label.replace(/ \(.*\)$/, '')}
                  </td>
                  <td className={`${AUTO_TINT} py-1.5 text-center`}>
                    <input type="checkbox" aria-label={`${o.label}: allowed`} checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} disabled={disabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
