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
   A page that has not loaded the stored policy passes `notLoaded`, and an
   untouched form then shows no sentence at all. Under the sentence,
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

**An existing connection whose policy is not loaded** shows one line above
the editor (`LoadPolicyBar`): the button **Load and decrypt your existing policy** and "stored
encrypted on the contract, changed <date>", with an (i) saying why loading is a
transaction. Above, never under the form: the form is taller than a screen,
and an owner who misses the button edits an empty form and overwrites the
policy they have. The chain shows only that the row exists and when it
changed — the keys are sealed inside it — and a connector page always stores
the policy with the credential, so the row stands for the policy; a row made
elsewhere without one says so once loaded. While the form is untouched and
unloaded it has no sentence (it would describe a value nobody has). Save stays
under the form, with a one-line warning while nothing is loaded: "Not loaded:
saving replaces your current policy, whatever it allows, with this form."

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

Every connector opens with ① What may it do?. A row of the table is one of:

| Row | Ticked means | Example |
|---|---|---|
| an operation of the allowed-actions field | listed in it | GitHub `issue_comment`; Mercury `accounts` |
| an operation of the ask field only | always allowed; radios choose auto or manual | Gmail `send` |
| a field that grants by being set (`row`) | the field is set; ticking sets `enable` | Gmail `max_attachment_kb` (2048); HL/PM `allow_deposit`, `allow_withdraw` |
| a derived row (`derivedRows`) | every field it `requires` is set | HL orders (order, volume, leverage caps); PM orders (order, volume) |

- **A switch that is one decision with an operation** (`link.onlyWith`: GitHub
  `allow_merge`, Mercury `allow_new_recipients`, `allow_invoicing`) is not
  drawn as a switch: its operation's row turns it on and off, and the row
  carries its explanation as a tooltip. A switch with a `row` is drawn only as
  that row.
- **A row that needs fields** (`needs`: Mercury's payments need both amounts;
  a derived row needs its `requires`) says under its label "runs once *Most per
  payment* and *Budget per 30 days* are set", each name a link that scrolls to
  the field and focuses it. A derived row that is off has no checkbox — ticking
  it would have to invent amounts — but "set ↓", which leads to the first
  missing limit. Unticking it clears its fields.
- **The open default** (HL/PM, `emptyIsOpen`): with nothing set, every row
  shows ticked and a line says "Built-in default: everything here runs, with no
  caps." The first change starts the owner's own rules from `ownStart` — the
  default's permissions without its "no caps": deposits on, withdrawals on and,
  for Hyperliquid, `withdraw_to: "intents"`, because an own policy with an
  empty destination lets the agent name any. Under own rules a link "Back to
  the built-in default" clears the policy.

| Connector | ① rows | Manual column | Limits after ① | Empty policy |
|---|---|---|---|---|
| **Gmail** | Mail: Send a message (radios), Attach files | Send only | Who can it write to? · How much? · What else? (attachment size, subject prefix) | anyone, no limits, no files |
| **GitHub** | 25 operations in 6 groups; merge carries `allow_merge` | writes; the Read group has none | Where? · How much? · Off unless you say so (approve, public gists) · How are its words told from yours? | nothing is allowed yet |
| **Mercury** | 12 operations in Read / Money out / Invoicing; save-a-payee and invoicing carry their switches; pay needs both amounts; the rules list under the table (§8) | the four writes (a plain rule) | How much may it pay? · To whom? · How? (rails, account) · Off unless you say so (count all, sandbox) | read-only |
| **Hyperliquid** | Trading: Place orders (derived, three caps); Money: Fund the venue, Withdraw back | — | How much may it trade? · Which coins? · Deposits and withdrawals (deposit cap, destination) | the built-in default: fully open |
| **Polymarket** | Trading: Place orders (derived, two caps); Money: Fund the venue, Withdraw back | — | How much may it trade? · Which markets? · Deposits and withdrawals (deposit cap, destination) | the built-in default: fully open |

When Hyperliquid or Polymarket gain a `confirm` or `rules` member in their
`policy.rs`, the dashboard change is one field (`asks: true`, with
`asksBefore` where an allowed-actions field exists) — and the manual column
appears beside the rows it names.

## 8. Rules with conditions

A decision that depends on what the call carries — *ask me before a wire;
payments from $500 wait for me; refuse new payees; cancelling an invoice waits
for me* — is a rule. Mercury reads them today (`connectors/mercury-connector/
src/rules.rs`); the editor draws them for any connector whose schema declares
a `rules` field.

**Model.** A policy's `rules` is an ordered list of `when` → `then`:

```jsonc
"rules": [
  { "when": { "op": "pay_invoice", "methods": ["domesticWire"] }, "then": "ask" },
  { "when": { "op": "pay_invoice", "min_usd": 500 },              "then": "ask" },
  { "when": { "op": "pay_invoice", "payee": "new" },              "then": "refuse" },
  { "when": { "op": "cancel_invoice" },                           "then": "ask" }
]
```

- `then` is one of the outcomes of §1 — `allow` (auto-approve), `ask` (manual
  approval), `refuse` — a serde enum in the connector: an unknown spelling
  fails to parse.
- `when` names an operation and zero or more **conditions** from the
  connector's vocabulary, each a typed member under `deny_unknown_fields`. A
  condition the operation does not carry (an amount on a cancellation) makes
  the policy unreadable, like a misspelt field.
- **The first rule that matches decides, in the owner's order. No rule
  matches: the call runs** as the rest of the policy allows it — rules decide
  among allowed calls, they do not add a second allow-list.
- **Limits always apply.** Rules are asked last, of a call every other check
  passed: an `allow` never lifts a cap, and a payment over the per-payment
  limit is refused whatever a rule says.

**The table and the list are one model.** A *plain* rule — an operation and
nothing else — is what the table's columns read and write: Manual approval
ticked is `{when:{op}, then:"ask"}`; a plain `refuse` reads as refused.
Ticking adds the plain rule **last**, after the conditional rules it is the
fallback of; Auto-approve removes it and leaves the conditional ones. The
operations that can carry a rule have the manual column; reads do not.

**The list**, under the table, titled "Rules, checked top to bottom", with the
field's (i):

```
1  [Paying ▾]  by ☑ Domestic wire ☐ ACH …  ×          →  [Auto-approve | Manual approval | Refuse]   ↑ ↓ ×
2  [Paying ▾]  from $ [500] ×  [+ condition ▾]         →  [Auto-approve | Manual approval | Refuse]   ↑ ↓ ×
3  [Cancelling an invoice ▾]                           →  [Auto-approve | Manual approval | Refuse]   ↑ ↓ ×
+ Add a rule
```

- One row per rule, in the order the connector reads them, plain rules
  included, numbered as the connector's refusals number them ("rule 2").
- The operation is a select; changing it keeps only the conditions the new
  operation carries. Conditions are chips in place — an amount, a set of
  rails, one payee kind — each removable; "+ condition" offers only what the
  operation carries and the rule does not set yet.
- The outcome is a three-way switch tinted like the table's columns, and
  `refuse` in the destructive tint.
- ↑ ↓ reorder; × removes. At most `ruleSpec.max` rules (50 for Mercury).
- An emptied condition is no condition: it is not written.
- `validate()` mirrors the connector and adds the one thing it cannot see: a
  rule shadowed by an earlier plain rule for the same operation ("rule 2
  never decides anything: rule 1 already decides every call of its
  operation"). The schema's `check()` names a rule about an operation the
  policy does not allow.
- The sentence lists the rules in order after the rest: "…Payments from $500
  wait for you; new payees are refused."

**Per connector, the conditions worth having** (each is a connector change
first — the member must exist in `policy.rs` and be judged in the enclave —
then one `ruleSpec` here):

| Connector | Operations | Conditions | State |
|---|---|---|---|
| Mercury | `pay_invoice`, `add_recipient`, `send_invoice`, `cancel_invoice` | `min_usd`, `max_usd` (payment amount, invoice lines before tax), `methods`, `payee` (`saved`/`new`) | live on testnet |
| Polymarket | `order` | category (needs the market's tags from the venue), notional range, side, market id | category availability at order time unknown — research first |
| Hyperliquid | `order`, `set_leverage` | coin, notional range, leverage range, reduce-only | not started |
| Gmail | `send` | recipient domain in / not in a list, attachments present, recipient count | not started |
| GitHub | writes | repository, branch (default branch), path patterns | not started |

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
