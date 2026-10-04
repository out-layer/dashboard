# Policy pages — design

How a connector's policy is shown and edited, for every connector: the five we
have (Gmail, GitHub, Mercury, Hyperliquid, Polymarket) and the ones to come.
`DESIGN.md` governs the shell, tokens, buttons and widths; this file adds what
a policy page is made of. Where the two disagree, `DESIGN.md` wins on tokens
and `POLICY_DESIGN.md` on the page's anatomy. The editor that implements it is
`components/policy/PolicyEditor.tsx`; a connector supplies only a schema in
`lib/policies/<connector>.ts`.

## 1. What a policy is

The owner's rule about what their agent may do with a credential or a wallet.
Every policy is read in the same order, by every connector:

1. **The owner's settings decide first.** The actions ticked, the limits typed,
   the switches turned on. The agent gets those and nothing wider.
2. **A field left empty falls to the connector's default for that field** — and
   that default is written under the field: "no limit", "any recipient", "no
   attachments", "nothing is written".
3. **Everything else is refused.** The one exception is a connector whose policy
   fences the agent's own wallet (Polymarket, Hyperliquid): with no policy, or an
   empty one, it runs fully open. A policy that sets anything is the owner's and
   is held to its fields.

A policy therefore has two kinds of content:

| Kind | What it answers | Examples |
|---|---|---|
| **Bounds** | where, how much, which way, what is off unless said | repositories, messages a day, leverage, rails, the marker line |
| **Decisions** | for each operation: does it run, and does it wait for me? | gist_create → ask me first; issue_comment → automatically; pr_merge → refused |

Each operation has exactly one of three outcomes:

| Outcome | In the JSON | What happens |
|---|---|---|
| **refused** | not in `actions` | the connector answers `policy_denied` |
| **automatically** | in `actions`, not in `confirm` | runs within the bounds, no question asked |
| **ask me first** | in `actions` and in `confirm` | prepared, checked against the bounds, left in the owner's inbox; one signature runs exactly what was shown |

"Ask me first" is not a fourth rule: it takes an action the policy allows and
makes it wait. **An action asked about is an action allowed.** A connector
with no `actions` list (Gmail) allows every operation by default, so it has two
outcomes only: automatically, or ask me first.

## 2. Anatomy

```
PageHeader                                   (the page's, per DESIGN.md)
┌──────────────────────────────────────────────────────────────────────┐
│ This policy: <one sentence — what the agent may do>                  │
│ ▸ How a policy decides   (the three rules, one line each)           │
└──────────────────────────────────────────────────────────────────────┘
① Where?              ② How much?            ③ Off unless you say so   ④ …
  Repositories          Writes a day            ☐ Merge pull requests
  [chips] [input]       [ 30 ] writes            Off: you merge them
  None: nothing that…   ☐ Approve in your name
  Branches it may…      ...
  ...
⑤ What may it do?        Start from: [Read only] [Issues and reviews] [Contributor…] clear
  READ            AUTOMATICALLY  ASK ME FIRST   CODE          AUTO  ASK      PULL REQUESTS  AUTO  ASK
  list repos          ☑             —           create branch  ☐    ☐       open a PR       ☑    ☐
  read a file         ☑             —           write a file   ☐    ☑       review          ☑    ☐
  …                                              commit         ☐    ☑       merge           ☐    ☐
  whole group         ☑                         whole group    ☐    ☑       whole group     ◪    ☐
  ⚠ errors, if any — in the owner's words
[Save] row — the page's, below the editor
```

In order, nothing above the sentence and nothing between the sections:

1. **The sentence.** `schema.summarize(value)`, recomputed on every change —
   the one thing a reader who opens nothing else still reads. An empty policy is
   described by the connector (`emptySummary`), never assumed: "nothing is
   allowed yet" for one that fails closed, "the built-in default" for one that
   runs open, "anyone, no limits" for one that narrows a consent already given.
   A page that has not loaded the stored policy passes `headline` and the line
   says so instead of describing a value it does not have. Under the sentence,
   closed, the three rules — in the words of §1, with the open-default
   exception named only on a connector that has it (`emptyIsOpen`).
2. **Bounds**: every schema group that is not the decision group, each a
   numbered section, laid side by side —
   `grid gap-x-8 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]`.
   Four groups on a 1440px screen are four columns; on a phone they stack. A
   group is a column, never a card: no border, no background, the section title
   is the separator.
3. **Decisions**: the group that holds the ask field (`asks: true`), last,
   full width. Presets first ("Start from:"), then the table, then the group's
   note. The table is one small table per operation group, flowing into columns
   (`md:columns-2 xl:columns-3`, `break-inside-avoid`), so twenty-five
   operations are three columns of eight rows and not a scroll.
4. **Errors**: `validate()`'s list, `text-xs text-destructive-text`, only when
   there are any. The page's Save button is disabled while there are.

Nothing on the page folds away. No "Customize", no "Show all 25", no (i) that
holds the only statement of what a field does when empty. Explanation that is
genuinely optional — why a rule exists, what a term means — goes in the (i);
the state of the policy never does.

## 3. Hierarchy

The eye must land on the question, then the field, then the default. The
section title is the strongest text in its section; the field label is lighter
than the values typed into it; the default is faintest and only there while the
field is empty.

| Element | Classes | Example |
|---|---|---|
| Section title | numeral `h-5 w-5 rounded-full border border-border-strong text-[11px] font-semibold tabular-nums text-muted-foreground` + `text-sm font-semibold text-foreground` | ② How much? |
| Field label | `text-xs font-medium text-muted-foreground` + `<InfoHint>` with `help` | Writes a day ⓘ |
| Value | `text-sm` in the control; numbers `tabular-nums` | 30 |
| Unit | `text-xs text-muted-foreground`, right of a number | writes, all kinds together |
| Default (`absentMeans`) | `text-xs text-faint-foreground`, under the control, only while empty | Not set: nothing is written at all. |
| Table header | `text-[11px] font-semibold uppercase tracking-wider text-faint-foreground` | AUTOMATICALLY |
| Group note | `text-xs text-muted-foreground` | Automatically: the agent runs it within the rules above… |

The numerals are the only coding device. No icons: the design system has none,
a glyph for "where" or "how much" is ambiguous, and `DESIGN.md` forbids
decorative elements. The numeral gives the reader a count ("five things to
decide") and a way to refer to a section ("in ③").

No `<fieldset>`/`<legend>`: browsers indent them and the indent reads as a
nested level that is not there. Sections are `<section>` + `<h3>`.

## 4. Controls

| Field kind | Control | Rules |
|---|---|---|
| `list` | chips + one input | type, Enter or comma adds; `normalize` then `validateEntry` per entry; chips `rounded border border-border bg-card-muted px-2 py-0.5 font-mono text-xs` with a × |
| `number` | `<input type=number>` `w-28 tabular-nums` + unit | `min` from the schema (default 1), whole numbers |
| `text` | `<input>` `max-w-xs` | placeholder is the usual value |
| `toggle` | checkbox + label on one line, (i) after | under it, indented to the label, its `absentMeans` while off ("Off: …") |
| `choices` without `asks` | one-column table, header "Allowed" | Mercury's rails and operations; presets above when the schema has them |
| decision group | the decision table (§5) | |

Inputs: `rounded-md border border-border-strong px-2.5 py-1.5 text-sm
focus:border-accent focus:ring-1 focus:ring-accent`. Tokens only — never
`gray-*`, never a hex.

**Presets** are one-click selections, labelled "Start from:" and rendered as
chips (`rounded-md border … text-xs`; the one matching the current selection
`border-accent bg-accent/10 text-accent-text`, `aria-pressed`). They set the
selection exactly — what a preset does not name is refused, asks included — and
they never replace the table under them. "clear" empties the selection.

## 5. The decision table

One row per operation, grouped as the connector groups them (Read, Issues,
Code…), two outcome columns. Behaviour:

- **Nothing ticked is refused.** No third box: an empty row says it.
- **The columns exclude each other.** Ticking "Ask me first" moves the row out
  of "Automatically" — it is no longer automatic, and the box there empties.
  Ticking "Automatically" on an asked row drops the ask and keeps it allowed.
  Unticking "Automatically" refuses the row, which drops its ask too.
- **A row that cannot wait** (a read: nothing to show the owner, nothing it
  changes) has a dash in the ask column, `title="Cannot wait for you: it changes
  nothing"`.
- **A connector with no allowed-actions field** (Gmail) has no refused state,
  so its rows are a pair of radios: automatic, or asked.
- **A whole-group row** under a group of more than one: a checkbox per column
  that ticks or unticks the group (indeterminate when some are), so "all of
  Read: automatically" is one click without a preset.
- Every change goes through `decide()` → `change()`, so a switch tied to an
  operation follows (asking about a merge turns "Merge pull requests" on;
  refusing it turns it off), and a stored policy is written in the vocabulary's
  own order whatever order it was clicked in.

Column headers carry an (i): "Automatically" explains the allowed-actions
field, "Ask me first" the ask field — what waits, where, and that approving
takes one signature.

## 6. Copy

- A section title is a question, in the owner's words: "Where?", "How much?",
  "What may it do?", "Off unless you say so". Never a field name.
- A field label says what is bounded, not how it is stored: "Writes a day", not
  `max_writes_per_day`. The key is in the (i) only when the owner may meet it
  in an agent's error.
- `absentMeans` starts with the state word and a colon — "Empty:", "Off:",
  "Nothing ticked:", "Not set:" — then what that permits or withholds, in one
  sentence.
- The sentence states permissions ("The agent may read, and comment…"), never
  restrictions, and ends with what it can never do and what waits for the owner.
- Errors say what to do, name the field by its label, and never a key alone:
  "Writes a day: set a number — without it none of the write actions you ticked
  will run".
- "Ask me first" is the term everywhere — the column, the field label, the
  rules, the sentence ("It asks you before committing."). Not "confirm", not
  "manual approval", not "Ask me before".

## 7. The five connectors on this anatomy

| Connector | Bounds (sections) | Decision rows | Ask column | Empty policy |
|---|---|---|---|---|
| **Gmail** | ① Who can it write to? (domains, addresses) ② How much? (a day, recipients) ③ What else? (attachments, subject prefix) | Send a message | radios: automatic / ask | anyone, no limits (a consent already given) |
| **GitHub** | ① Where? (repos, branches, paths) ② How much? (writes a day) ③ Off unless you say so (merge, approve, public gists) ④ How are its words told from yours? (marker) | 25 operations in 6 groups; 12 reads cannot be asked | checkboxes, exclusive | nothing is allowed yet |
| **Mercury** | ① How much may it pay? ② To whom? ③ How? (rails, account) ④ Off unless you say so (invoicing, count all, sandbox) ⑤ Which operations at all? (one-column table, empty = all) | — (no `confirm` yet) | — | read-only |
| **Hyperliquid** | ① How much may it trade? ② Which coins? ③ May money move in and out? | — | — | the built-in default: fully open |
| **Polymarket** | ① How much may it trade? ② Which markets? ③ May money move in and out? | — | — | the built-in default: fully open |

When Mercury, Hyperliquid or Polymarket gain a `confirm` member in their
`policy.rs`, the dashboard change is one field: `{ key: 'confirm', kind:
'choices', asks: true, asksBefore: 'allowed_operations' }` in a group named
"What may it do?" — and the table appears. For the trading connectors the rows
would be their operations (`order`, `cancel`, `deposit`, `withdraw`, …) with
no allowed-actions field, so radios, like Gmail.

## 8. Conditional rules (next)

Owners will want decisions that depend on the call: *ask me before a sports
bet over $100; place political bets under $500 by itself; ask before any mail
to a domain not in the list; ask before writing to `main`*. The anatomy above
already has the place for it — the decision table — and this is how it grows
without becoming a second kind of page.

**Model.** A rule is `when` → `then`:

```jsonc
"rules": [
  { "when": { "op": "order", "category": "sports",   "min_usd": 100 }, "then": "ask" },
  { "when": { "op": "order", "category": "politics", "max_usd": 500 }, "then": "allow" },
  { "when": { "op": "order" },                                          "then": "refuse" }
]
```

- `then` is one of the three outcomes of §1; the connector spells them as a
  serde enum (`allow | ask | refuse`), exhaustive `match`, unknown spelling
  fails to parse.
- `when` names an operation (or an operation class the connector defines, such
  as `write`) and zero or more **conditions** from a vocabulary each connector
  declares — a market category, a notional range, a recipient domain, a
  repository or branch pattern, a payee. Every condition is a typed field in
  `policy.rs` under `deny_unknown_fields`; a condition the build does not know
  makes the policy unreadable, as today.
- **First match wins, in the owner's order.** The last row is the default for
  the operation; with no matching rule the operation is refused (rule 3 of §1).
- **Bounds always apply.** Rules pick the outcome; they never widen a cap. An
  order asked about that exceeds `max_order_usd` is still refused, and the
  sentence says so.
- A plain `actions`/`confirm` policy is the degenerate case: one rule per
  operation with no conditions. The connector reads either form; the editor
  writes `actions`/`confirm` until a rule carries a condition.

**Page.** The decision table gains a **When** column, and a row is a rule
rather than an operation:

```
⑤ What may it do?
  ORDERS                        WHEN                               AUTOMATICALLY  ASK ME FIRST
  order                         sports · from $100                      ☐             ☑
  order                         politics · up to $500                   ☑             ☐
  order                         everything else                         ☐             ☐     ← the default row, always last
  + add a rule for orders
```

- The schema declares `conditions` for a decision field: each a `PolicyField`
  of kind `choices` (category), `number` (a range end), `list` (domains,
  patterns) — the same controls as the bounds, rendered inline in the When
  cell as chips, with "+ add a condition" opening the one picker.
- Rows of one operation are ordered by drag handle (↕) and by "move up/down"
  buttons for the keyboard; the default row cannot move or be deleted.
- The sentence lists the conditional rows after the plain ones: "…orders in
  sports from $100 wait for you; orders in politics up to $500 run by
  themselves; other orders are refused."
- `validate()` gains two checks: a rule shadowed by an earlier wider one
  ("rule 2 never runs: rule 1 already decides every politics order"), and a
  conditional ask on an operation the bounds refuse anyway.

**Per connector, the conditions worth having** (each is a connector change
first — the field must exist in `policy.rs` and be judged in the enclave —
then one schema entry here):

| Connector | Operation | Conditions | Example rule |
|---|---|---|---|
| Polymarket | `order` | category (needs the market's tags from the venue), notional range, side (yes/no), market id | *sports from $100 → ask* |
| Hyperliquid | `order`, `set_leverage` | coin, notional range, leverage range, reduce-only | *BTC and ETH up to $500 → automatically; anything else → ask* |
| Mercury | `pay_invoice`, `add_recipient` | amount range, payee (saved or new), rail | *wires → ask; ACH up to $1,000 to saved payees → automatically* |
| Gmail | `send` | recipient domain in / not in a list, attachments present, recipient count | *mail outside example.com → ask* |
| GitHub | writes | repository pattern, branch pattern (default branch), path pattern | *writes to main → ask; writes under docs/* on agent/* → automatically* |

Whether Polymarket's categories are reliably available at order time is
unknown until the connector reads them; that row is the one with a research
step before a plan.

## 9. Checklist for a policy page

- [ ] The schema has at most one `asks` field, in the same group as the field
      `asksBefore` names; the group is last and named "What may it do?"
- [ ] Every field has `help` and an `absentMeans` that starts with its state word
- [ ] `emptySummary` says what an empty policy does; `emptyIsOpen` only where it
      is literally true in the connector
- [ ] `summarize()` states permissions and ends with what waits for the owner
- [ ] `check()` names fields by label and says what to do
- [ ] The page's root is `w-full`; prose blocks are `max-w-3xl`; the editor is
      not inside a reading column
- [ ] Checked at 390px (everything stacks, the tables fit) and at 1440px (bounds
      side by side, the table in three columns, no scroll to reach Save)
- [ ] Both themes; tokens only
- [ ] `test/policy-<connector>.test.mjs` round-trips the JSON and
      `test/policy-decision.test.mjs` still passes
