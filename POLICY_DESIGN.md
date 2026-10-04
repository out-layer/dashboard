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
| **Decisions** | for each operation: does it run, and does it wait for me? | gist_create → manual approval; issue_comment → auto-approve; pr_merge → refused |
| **Limits** | where, how much, which way, what is off unless said | repositories, messages a day, leverage, rails, the marker line |

Each operation has exactly one of three outcomes:

| Outcome | In the JSON | What happens |
|---|---|---|
| **refused** | not in `actions` | the connector answers `policy_denied` |
| **auto-approve** | in `actions`, not in `confirm` | runs within the limits, no question asked |
| **manual approval** | in `actions` and in `confirm` | prepared, checked against the limits, left in the owner's inbox; one signature runs exactly what was shown |

Manual approval is not a fourth rule: it takes an action the policy allows and
makes it wait. **An action that needs approval is an action allowed.** A
connector with no `actions` list (Gmail) allows every operation by default,
so it has two outcomes only: auto-approve, or manual approval.

## 2. Anatomy

```
PageHeader                                   (the page's, per DESIGN.md)
┌──────────────────────────────────────────────────────────────────────┐
│ This policy: <one sentence — what the agent may do>                  │
│ ▸ How a policy decides   (the rules, one line each)                  │
└──────────────────────────────────────────────────────────────────────┘
① What may it do?
  Auto-approve: runs within the limits below. Manual approval: waits in your inbox…
  [READ 12/12]     AUTO        [ISSUES 1/3]      AUTO  MANUAL   [PULL REQUESTS 0/3] AUTO  MANUAL
  list repos        ☑          open an issue       ☐     ☑       open a PR             ☐     ☐
  read a file       ☑          comment             ☐     ☐       review                ☐     ☐
  …                            retitle, close      ☐     ☐       merge                 ☐     ☐
② Where?                ③ How much?             ④ Off unless you say so   ⑤ …
  Repositories ⓘ          Writes a day ⓘ           ☐ Merge pull requests ⓘ
  ┌───────────────────┐   [ 30 ] writes             ☐ Approve in your name ⓘ
  │ a/b × c/d × add…  │
  └───────────────────┘
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
   closed, the rules — in the words of §1, with the open-default exception
   named only on a connector that has it (`emptyIsOpen`).
2. **Decisions first**: the group that holds the ask field (`asks: true`),
   section ①, full width. What the agent may do is the first question an owner
   has; where and how much qualify the answer. The group's note — what each
   column means — sits under the title, then the table: one small table per
   operation group, flowing into columns (`md:columns-2 xl:columns-3`,
   `break-inside-avoid`), so twenty-five operations are three columns of eight
   rows and not a scroll.
3. **Limits**: every other schema group, numbered on from ②, side by side —
   `grid gap-x-8 gap-y-6 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]`.
   Four groups on a 1440px screen are four columns; on a phone they stack. A
   group is a column, never a card: no border, no background, the section title
   is the separator.
4. **Errors**: `validate()`'s list, `text-xs text-destructive-text`, only when
   there are any. The page's Save button is disabled while there are.

Nothing on the page folds away: no "Customize", no "Show all 25", no preset
that stands in for the table. A field's explanation and what leaving it empty
means are in its (i); what an empty field does to the agent is also in the
sentence at the top, and a combination that cannot work (writes ticked with no
repository) is an error under the editor — so the reader who opens no (i) still
learns every consequence that matters.

## 3. Hierarchy

The eye must land on the question, then the field. The section title is the
strongest text in its section; the field label is lighter than the values
typed into it.

| Element | Classes | Example |
|---|---|---|
| Section title | numeral `h-5 w-5 rounded-full border border-border-strong text-[11px] font-semibold tabular-nums text-muted-foreground` + `text-sm font-semibold text-foreground` | ② Where? |
| Field label | `text-xs font-medium text-muted-foreground` + `<InfoHint>`: `help`, then "Left empty: `absentMeans`" | Repositories ⓘ |
| Value | `text-sm` in the control; numbers `tabular-nums` | 30 |
| Unit | `text-xs text-muted-foreground`, right of a number | writes, all kinds together |
| Group switch (table header) | chip, `text-[11px] font-semibold uppercase tracking-wider` + count `on/of` | READ 12/12 |
| Column header | `text-[11px] font-semibold uppercase tracking-wider text-faint-foreground` on the column's tint | AUTO-APPROVE |
| Group note | `text-xs text-muted-foreground`, under the section title | Auto-approve: the agent runs it within the limits below… |

The numerals and the two column tints are the only coding devices. No icons:
the design system has none, a glyph for "where" or "how much" is ambiguous,
and `DESIGN.md` forbids decorative elements. The numeral gives the reader a
count ("five things to decide") and a way to refer to a section ("in ③").

**Column tints** mean the outcome, so they are not decoration: auto-approve is
`bg-success/[0.07]`, manual approval `bg-info/[0.08]`, on the header and every
cell of the column, on every connector. A one-column "Allowed" table (Mercury)
takes the auto-approve tint. Nothing else on the page is tinted.

No `<fieldset>`/`<legend>`: browsers indent them and the indent reads as a
nested level that is not there. Sections are `<section>` + `<h3>`.

## 4. Controls

| Field kind | Control | Rules |
|---|---|---|
| `list` | one box: the entries as chips, the input at their end | Enter, a comma or a space adds the entry typed; a pasted list (commas, spaces or lines between) adds every entry; Backspace in an empty input removes the last chip; `normalize` then `validateEntry` per entry. The box scrolls past `max-h-32`; from five entries a line under it gives the count and "clear all". A hundred repositories are a scrolling box of a fixed height, not a column that pushes the form down. |
| `number` | `<input type=number>` `w-28 tabular-nums` + unit | `min` from the schema (default 1), whole numbers |
| `text` | `<input>` `max-w-xs` | placeholder is the usual value |
| `toggle` | checkbox + label on one line, (i) after | what "off" means is in the (i) |
| `choices` without `asks` | one-column table, header "Allowed" | Mercury's rails and operations; each group's name is its switch |
| decision group | the decision table (§5) | |

Inputs: `rounded-md border border-border-strong px-2.5 py-1.5 text-sm
focus:border-accent focus:ring-1 focus:ring-accent`. Tokens only — never
`gray-*`, never a hex.

**A group's name is its switch.** The header of every operation table is a
chip naming the group and how many of its rows are on (`READ 12/12`). A click
turns every row of the group on — as auto-approve, leaving a row that already
needs manual approval as it is; once all are on, the next click refuses them
all. All on: `border-accent bg-accent/10 text-accent-text`, `aria-pressed`;
some on: a dashed accent border; none: neutral. Named selections that cross
groups ("Contributor") are not offered: a switch that removes what another one
added is a switch nobody can predict.

## 5. The decision table

One row per operation, grouped as the connector groups them (Read, Issues,
Code…), two outcome columns. Behaviour:

- **Nothing ticked is refused.** No third box: an empty row says it.
- **The columns exclude each other.** Ticking "Manual approval" moves the row
  out of "Auto-approve". Ticking "Auto-approve" on a row that needs approval
  drops the approval and keeps it allowed. Unticking "Auto-approve" refuses the
  row, which drops its approval too.
- **A group none of whose rows can wait** (reads: nothing to show the owner,
  nothing they change) has no manual column at all. A mixed group shows a dash
  where a row cannot wait, `title="Cannot wait for you: it changes nothing"`.
- **A connector with no allowed-actions field** (Gmail) has no refused state,
  so its rows are a pair of radios — auto-approve or manual approval — and the
  group name is a plain heading, not a switch.
- Columns carry no (i): the group's note under the section title says what
  each outcome does, once.
- Every change goes through `decide()` → `change()`, so a switch tied to an
  operation follows (approval on a merge turns "Merge pull requests" on;
  refusing it turns it off), and a stored policy is written in the vocabulary's
  own order whatever order it was clicked in.

## 6. Copy

- A section title is a question, in the owner's words: "What may it do?",
  "Where?", "How much?", "Off unless you say so". Never a field name.
- A field label says what is bounded, not how it is stored: "Writes a day", not
  `max_writes_per_day`. The key is in the (i) only when the owner may meet it
  in an agent's error.
- `absentMeans` starts with the state word and a colon — "Empty:", "Off:",
  "Nothing ticked:", "Not set:" — then what that permits or withholds, in one
  sentence. It is shown in the (i) after "Left empty:".
- The sentence states permissions ("The agent may read, and comment…"), never
  restrictions, and ends with what it can never do and what waits for the owner.
- Errors say what to do, name the field by its label, and never a key alone:
  "Writes a day: set a number — without it none of the write actions you ticked
  will run".
- The two outcomes are "Auto-approve" and "Manual approval" everywhere — the
  columns, the field label, the rules, the notes. Not "confirm", not "Ask me
  before". The sentence may say it in a verb: "It asks you before committing."
- A button says what it does, never asks: "Overwrite the stored policy", not
  "Yes, overwrite…" when no question is on the screen.

## 7. The five connectors on this anatomy

| Connector | Limits (sections after ①) | Decision rows (①) | Manual column | Empty policy |
|---|---|---|---|---|
| **Gmail** | ② Who can it write to? (domains, addresses) ③ How much? (a day, recipients) ④ What else? (attachments, subject prefix) | Send a message | radios: auto-approve / manual approval | anyone, no limits (a consent already given) |
| **GitHub** | ② Where? (repos, branches, paths) ③ How much? (writes a day) ④ Off unless you say so (merge, approve, public gists) ⑤ How are its words told from yours? (marker) | 25 operations in 6 groups; the Read group has no manual column | checkboxes, exclusive | nothing is allowed yet |
| **Mercury** | ① How much may it pay? ② To whom? ③ How? (rails, account) ④ Off unless you say so (invoicing, count all, sandbox) ⑤ Which operations at all? (one-column table, empty = all) — no ① decisions until it has `confirm` | — (no `confirm` yet) | — | read-only |
| **Hyperliquid** | ① How much may it trade? ② Which coins? ③ May money move in and out? | — | — | the built-in default: fully open |
| **Polymarket** | ① How much may it trade? ② Which markets? ③ May money move in and out? | — | — | the built-in default: fully open |

When Mercury, Hyperliquid or Polymarket gain a `confirm` member in their
`policy.rs`, the dashboard change is one field: `{ key: 'confirm', kind:
'choices', asks: true, asksBefore: 'allowed_operations' }` in a group named
"What may it do?" — and the table appears, first. For the trading connectors the rows
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
- **Limits always apply.** Rules pick the outcome; they never widen a cap. An
  order asked about that exceeds `max_order_usd` is still refused, and the
  sentence says so.
- A plain `actions`/`confirm` policy is the degenerate case: one rule per
  operation with no conditions. The connector reads either form; the editor
  writes `actions`/`confirm` until a rule carries a condition.

**Page.** The decision table gains a **When** column, and a row is a rule
rather than an operation:

```
① What may it do?
  [ORDERS 3/3]                  WHEN                               AUTO-APPROVE   MANUAL APPROVAL
  order                         sports · from $100                      ☐             ☑
  order                         politics · up to $500                   ☑             ☐
  order                         everything else                         ☐             ☐     ← the default row, always last
  + add a rule for orders
```

- The schema declares `conditions` for a decision field: each a `PolicyField`
  of kind `choices` (category), `number` (a range end), `list` (domains,
  patterns) — the same controls as the limits, rendered inline in the When
  cell as chips, with "+ add a condition" opening the one picker.
- Rows of one operation are ordered by drag handle (↕) and by "move up/down"
  buttons for the keyboard; the default row cannot move or be deleted.
- The sentence lists the conditional rows after the plain ones: "…orders in
  sports from $100 wait for you; orders in politics up to $500 run by
  themselves; other orders are refused."
- `validate()` gains two checks: a rule shadowed by an earlier wider one
  ("rule 2 never runs: rule 1 already decides every politics order"), and a
  conditional ask on an operation the limits refuse anyway.

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
      `asksBefore` names; that group is named "What may it do?" and renders first
- [ ] Every field has `help` and an `absentMeans` that starts with its state word,
      and `summarize`/`check` cover every empty field whose default refuses something
- [ ] `emptySummary` says what an empty policy does; `emptyIsOpen` only where it
      is literally true in the connector
- [ ] `summarize()` states permissions and ends with what waits for the owner
- [ ] `check()` names fields by label and says what to do
- [ ] The page's root is `w-full`; prose blocks are `max-w-3xl`; the editor is
      not inside a reading column
- [ ] Checked at 390px (everything stacks, the tables fit) and at 1440px (limits
      side by side, the table in three columns, no scroll to reach Save)
- [ ] Both themes; tokens only
- [ ] `test/policy-<connector>.test.mjs` round-trips the JSON and
      `test/policy-decision.test.mjs` still passes
