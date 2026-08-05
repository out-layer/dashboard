# OutLayer Dashboard — Design Guidelines

Every page is built the same way. If a screen deviates from this file, the screen
is wrong — fix the screen or propose a change here first.

## Principles

1. **Strict.** No emoji, no gradients on controls, no decorative color. If an
   element is colored, the color must MEAN something (see Color roles).
2. **Light is the default theme, dark is the second.** Never hardcode colors —
   only tokens. Both themes must be checked before shipping.
3. **One accent.** Amber `--accent` is the only interactive/brand color.
   Attestation chips share it on purpose: proof IS the brand.
4. **Density over air.** Cloudflare-grade: 13–14px UI text, compact paddings,
   `tabular-nums` on every number that can be compared.
5. **Navigation lives in the shell only.** Pages never render links that
   duplicate the sidebar (no "Approvals / Audit" headers inside pages).
   In-page links point only to things the sidebar does NOT have (docs anchors,
   external explorers, detail pages).

## Page skeleton

Every page renders inside the shell's `<main>` (already padded) in this exact
order — nothing above the header, nothing wraps the page in a width container:

```tsx
<div className="w-full">
  {/* 1. Header — ALWAYS components/ui/page-header.tsx, never a raw h1 */}
  <PageHeader
    title="Page name"                    // = sidebar label, exactly
    description="One factual sentence."
    action={<Button onClick={...}>Create thing</Button>}  // optional, ONE
  />

  {/* 2. Feedback banners (only when present) */}
  {/* 3. Content: tiles / table / cards / form — see width rules */}
  {/* 4. Informational plate (optional, ONE per page, last) */}
</div>
```

- Page name matches the sidebar label exactly ("Wallets", not "Manage Wallets").
- The wallet gate is ALWAYS `<RequireWallet subject="…" />` — never bespoke.
- `PageHeader` carries the brand "layer shift" mark: a faint base stroke and
  the same stroke in amber, moved out in front (the » of the wordmark,
  verticalized — OutLayer runs your work on another, better layer). It also
  starts the h1 on the same vertical line as card content (`pl-5` =
  CardHeader padding). On hover the strokes trade places (300 ms transition,
  reverses smoothly mid-flight, disabled under `prefers-reduced-motion`).
  This is the ONLY sanctioned decorative element and the only allowed
  gradient outside charts — do not invent page-level ornaments elsewhere.
- The header `action` button is ALWAYS the solid accent `<Button>` — the one
  attention-drawing control of the page ("New key", "Refresh", "Disconnect").
  Never render the connected account in a page header — the shell's
  AccountChip already shows it. Filter/toolbar clusters (checkboxes, column
  pickers) may also live in `action`; they keep their quiet styling.
- Gated returns (`!isConnected`) still render `<PageHeader title …/>` above
  `<RequireWallet …/>` — the page must not lose its header when logged out.
- A create-form + list pair may sit side-by-side on wide screens:
  `grid items-start gap-6 xl:grid-cols-2` (stacked below `xl`). Width rules
  then apply per column.

## Width rules

| Content | Width |
|---|---|
| Tables, tile grids (`MetricCard` rows), charts | full width |
| Reading columns: lists of detail cards (approvals, wallets) | `max-w-3xl` |
| Informational plates ("About …", "How it works") | `max-w-3xl` |
| Form CARD/section | full width |
| Individual inputs, selects, textareas inside it | `max-w-xl` |
| Modals | `max-w-md` (forms) / `max-w-4xl` (viewers) |

Nothing is horizontally centered. Ever. (`mx-auto`, `text-center` are allowed
only inside table cells and the anonymous product home.)

## Color roles

| Role | Token | Used for | Never for |
|---|---|---|---|
| Accent | `accent` / `accent-text` / `on-accent` | primary buttons, links, active nav, attestation chips | success/error states |
| Success | `success` / `success-text` | completed states, positive semantic actions (Unfreeze) | decoration, links |
| Destructive | `destructive` / `destructive-text` | errors, dangerous actions (Freeze, Reject) | emphasis |
| Warning | `warning` | genuine cautions — ALWAYS with an icon or explicit label | info plates, hints |
| Info | `info` | informational states (FROZEN chip) | buttons, decoration |
| Neutrals | `foreground` / `muted-foreground` / `faint-foreground`, `card` / `card-muted`, `border` / `border-strong` | everything else | — |

Hints and "About" content are NEUTRAL (`bg-card-muted border-border`), not blue
or yellow.

## Elements (the only sanctioned variants)

**Buttons** — use `components/ui/button.tsx` or its exact classes. One primary
per view.
- Primary: `bg-accent text-on-accent hover:bg-accent-hover` + `text-sm font-semibold rounded-lg px-4 py-2`.
  `--on-accent` is WHITE (both themes) and `--accent-hover` is a DARKER amber —
  hover deepens the button, never lightens it (white label stays crisp).
- Secondary: `border border-border-strong text-foreground hover:border-accent hover:text-accent-text`
- Danger: `border border-destructive/40 text-destructive-text hover:bg-destructive/10` (or solid `bg-destructive text-white` for the final action)
- Semantic green solid only for un-dangerous state restore (Unfreeze).
- Forbidden: blue buttons, gray buttons, gradients, raw `text-white`/hex on
  accent instead of the `text-on-accent` token.
- Cursor: globals.css gives every enabled button/`[role=button]`/select/summary
  `cursor: pointer` — never sprinkle `cursor-pointer` per element, and disabled
  controls keep the arrow.

**Cards**: `components/ui/card.tsx` (`rounded-lg border border-border bg-card`).
Tables sit in `rounded-md` + `overflow-hidden` variants. No shadows on static
surfaces — shadows belong to floating elements only (modals, dropdowns, ⌘K).

**Tables**: full width; header row
`text-[11px] font-semibold uppercase tracking-wider text-faint-foreground`,
rows `border-b border-border` + `hover:bg-card-muted/60`, numeric cells
`text-right tabular-nums`, ids/hashes via `<HashChip>`, per-row proof via
`<AttestationBadge>`.

**Forms**: label `block text-sm font-medium mb-1`; field
`max-w-xl rounded-md border border-border-strong px-3 py-2 text-sm outline-none
focus:border-accent focus:ring-1 focus:ring-accent` (background comes from the
global CSS — never set `bg-card`/white on fields); helper text
`mt-1 text-xs text-faint-foreground`.

**Empty states**: `<EmptyState title description action />` — left-aligned,
dashed border. Never a bespoke centered div.

**Feedback banners** (below header, above content):
- error: `rounded-md border border-destructive/30 bg-destructive/10 p-3` + `text-sm text-destructive-text`
- success: same with `success`
- info prompt: same with `info`

**Loading**: `animate-spin rounded-full h-8 w-8 border-b-2 border-accent` +
muted caption. Skeletons preferred for tables (future).

**Badges** (`components/ui/badge.tsx`): status uses semantic variants;
categories use `outline`; the attestation chip is ALWAYS `<AttestationBadge>`.

**Code**: only `<CodeBlock>` (new UI) or the `components/ui/syntax` shim (docs).
Ids/accounts/hashes: `<HashChip>` — never a raw truncated string.

**Help popover**: `<InfoHint text="…" />` — the small (i) button next to a
label/heading, click-toggled popover for explaining a term ("Via proxy
contracts"). Supplementary only: information the user MUST read never goes
behind it.

## Shell footer

Left-aligned, never centered: `© 2026 OutLayer · tagline` on the left, a
link row (Docs, Workers, GitHub, X) on the right, all `text-xs
text-muted-foreground hover:text-foreground`. Pages never render their own
footers.

## Typography

- Page h1: `text-xl font-bold tracking-tight`
- Card/section title: `text-sm font-semibold` (CardTitle)
- Body: `text-sm`; secondary: `text-sm text-muted-foreground`
- Micro/labels: `text-xs`; overlines: `text-[11px] font-semibold uppercase tracking-wider text-faint-foreground`
- Numbers that align: `tabular-nums`. Mono only for ids/code (`font-mono`).

## Page PR checklist

- [ ] Skeleton matches this file; h1 equals sidebar label
- [ ] No in-page duplicates of sidebar navigation
- [ ] Widths per table above (fields `max-w-xl`, plates/lists `max-w-3xl`)
- [ ] Only sanctioned buttons/badges/banners/empty states
- [ ] No raw hexes, no `gray-*`/palette-family classes, no emoji
- [ ] Checked in BOTH themes and at 390px width
- [ ] `npm run build` exit code checked (not masked by a pipe)
