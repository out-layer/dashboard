// The policy page's shape, as POLICY_DESIGN.md fixes it: every control on the
// page, the sentence first, bounds in a grid, the decision table with its two
// columns, numbered sections, design tokens only — and the pages that host the
// editor no longer squeeze it into a reading column. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync(new URL('../components/policy/PolicyEditor.tsx', import.meta.url), 'utf8');
const ownerPage = readFileSync(new URL('../components/connect/ConnectorOwnerPage.tsx', import.meta.url), 'utf8');
const gmailPage = readFileSync(new URL('../app/connect/gmail/page.tsx', import.meta.url), 'utf8');
const design = readFileSync(new URL('../POLICY_DESIGN.md', import.meta.url), 'utf8');

test('nothing folds away: no Customize, no hidden list, no defaultOpen', () => {
  assert.doesNotMatch(editor, /Customize|Hide the list|Show all|defaultOpen|setOpen/);
  assert.doesNotMatch(ownerPage, /defaultOpen/);
  assert.doesNotMatch(gmailPage, /defaultOpen/);
});

test('the sentence comes first, then what it may do, then where and how much', () => {
  const sentence = editor.indexOf('This policy:');
  const rules = editor.indexOf('How a policy decides');
  const table = editor.indexOf('<DecisionTable');
  const limits = editor.indexOf('grid-template-columns:repeat(auto-fit');
  assert.ok(sentence > 0 && sentence < rules && rules < table && table < limits);
  assert.match(editor, /Your settings decide first/);
  assert.match(editor, /falls to the connector’s own default for it, said in the field’s \(i\)/);
  assert.match(editor, /Everything else is refused/);
  assert.match(editor, /schema\.emptyIsOpen\s*\?/, 'the open-default exception is named only for connectors that have it');
});

test('the decision table: Auto-approve | Manual approval, tinted, no (i) in the headers, no manual column where nothing can wait', () => {
  assert.match(editor, />\s*Auto-approve\s*</);
  assert.match(editor, />\s*Manual approval\s*</);
  assert.doesNotMatch(editor, /Automatically|Ask me first/);
  assert.match(editor, /const AUTO_TINT = 'bg-success\/\[0\.07\]'/);
  assert.match(editor, /const MANUAL_TINT = 'bg-info\/\[0\.08\]'/);
  const table = editor.slice(editor.indexOf('function DecisionTable'), editor.indexOf('function ChoicesTable'));
  assert.doesNotMatch(table, /<InfoHint/, 'column headers carry no (i)');
  assert.match(table, /const manual = group\.rows\.some\(\(r\) => r\.askable\)/);
  assert.match(table, /const radios = !r\.refusable;/, 'radios per row: only a row that cannot be refused');
  assert.match(table, /\{manual && \(/);
  assert.match(editor, /now === 'automatic' && !radios \? 'refused' : 'automatic'/);
  assert.match(editor, /now === 'asked' && !radios \? 'automatic' : 'asked'/);
  assert.match(editor, /type=\{radios \? 'radio' : 'checkbox'\}/, 'two outcomes only where nothing can be refused');
  assert.match(editor, /changes\.reduce\(\(v, \[op, d\]\) => decide\(schema, v, op, d\), base\)/);
});

test('a group name is its switch: on, then off; no presets anywhere', () => {
  assert.match(editor, /function GroupSwitch/);
  assert.match(editor, /on === group\.rows\.length\s*\? group\.rows\.map\(\(r\) => \[r\.id, 'refused'\]\)\s*: group\.rows\.filter\(\(r\) => decisionOf\(r\.id\) === 'refused'\)\.map\(\(r\) => \[r\.id, 'automatic'\]\)/);
  assert.match(editor, /const switchable = group\.rows\.every\(\(r\) => r\.refusable && !r\.derived\);/, 'a group with a row that cannot be refused has a plain heading');
  assert.match(editor, /aria-pressed=\{all\}/);
  assert.doesNotMatch(editor, /presets|Start from|>whole group</);
  for (const f of ['github', 'mercury', 'gmail', 'hyperliquid', 'polymarket', 'types']) {
    assert.doesNotMatch(readFileSync(new URL(`../lib/policies/${f}.ts`, import.meta.url), 'utf8'), /presets|ChoicePreset/, f);
  }
});

test('a list is one box: chips and the input together, pasted lists split, a long list scrolls', () => {
  const list = editor.slice(editor.indexOf('function ListInput'), editor.indexOf('const TH ='));
  assert.match(list, /\.split\(\/\[\\s,\]\+\/\)/);
  assert.match(list, /max-h-32[^"]*overflow-y-auto/);
  assert.match(list, /entries\.length >= 5/);
  assert.match(list, /clear all/);
  assert.match(list, /e\.key === 'Backspace' && draft === ''/);
});

test('sections are numbered, decisions first, and what empty means is in the (i)', () => {
  assert.match(editor, /<SectionTitle n=\{1\}>/);
  assert.match(editor, /<SectionTitle n=\{i \+ \(decision \? 2 : 1\)\}>/);
  assert.match(editor, /text-sm font-semibold text-foreground/, 'the section title is the strongest text');
  assert.match(editor, /text-xs font-medium text-muted-foreground/, 'the field label is lighter');
  assert.match(editor, /Left empty:<\/strong> \{field\.absentMeans\}/);
  assert.doesNotMatch(editor, /faint-foreground">\{field\.absentMeans\}/, 'not printed under the field');
  assert.doesNotMatch(editor, /<fieldset|<legend/, 'no fieldset indentation');
});

test('a button says what it does: no "Yes," where no question is asked', () => {
  for (const src of [ownerPage, gmailPage]) {
    assert.doesNotMatch(src, /Yes, overwrite/);
    assert.match(src, /'Overwrite the stored policy'/);
  }
});

test('design tokens only — no palette classes, no raw hexes', () => {
  assert.doesNotMatch(editor, /\b(gray|red|green|blue|amber|yellow)-\d{2,3}\b/);
  assert.doesNotMatch(editor, /#[0-9a-fA-F]{6}/);
});

test('the pages give the editor the width of the screen and keep prose in a reading column', () => {
  for (const [name, src] of [['owner page', ownerPage], ['gmail page', gmailPage]]) {
    assert.doesNotMatch(src, /className="max-w-2xl space-y-4"/, `${name}: the root no longer narrows everything`);
    assert.match(src, /className="w-full space-y-4"/, name);
    assert.ok((src.match(/max-w-3xl/g) ?? []).length >= 8, `${name}: prose blocks are bounded`);
  }
});

test('the design doc exists, is separate from DESIGN.md, and fixes what the editor does', () => {
  assert.match(design, /# Policy pages/);
  for (const must of ['Auto-approve', 'Manual approval', 'refused', 'How a policy decides', 'auto-fit', 'The first rule that matches decides', 'Polymarket', 'Hyperliquid', 'Mercury', 'Gmail', 'GitHub']) {
    assert.ok(design.includes(must), `POLICY_DESIGN.md names ${must}`);
  }
  const base = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  assert.match(base, /POLICY_DESIGN\.md/, 'DESIGN.md points at it');
});

// The form is tall: the button that loads the stored policy sits ABOVE it, and
// says a policy exists — read off the row, the only thing the chain shows.
test('the load button is one line above the form, on both pages, and nowhere below', () => {
  const bar = readFileSync(new URL('../components/policy/LoadPolicyBar.tsx', import.meta.url), 'utf8');
  assert.match(bar, /'Load and decrypt your existing policy'/);
  assert.match(bar, /stored encrypted on the contract/);
  assert.match(bar, /<InfoHint/, 'why it takes a transaction is in the (i), not a block');
  assert.doesNotMatch(bar, /<details|bg-card-muted/, 'one line, not a plate');
  // An untouched, unloaded form has no sentence above it: the bar and the Save warning say it.
  assert.match(editor, /const untouched = notLoaded && isUnrestricted\(value\);/);
  assert.doesNotMatch(editor, /headline/);
  for (const [name, src] of [['owner page', ownerPage], ['gmail page', gmailPage]]) {
    const at = src.indexOf('<LoadPolicyBar');
    const editor = src.indexOf('<PolicyEditor\n');
    assert.ok(at > 0 && at < editor, `${name}: the bar comes before the editor`);
    assert.match(src, /<LoadPolicyBar saved=\{policyRead\?\.origin === 'saved'\} updatedAt=\{updatedAt\}/);
    assert.match(src, /notLoaded=\{!policyRead\}/);
    assert.doesNotMatch(src, /'Load current policy'/, `${name}: no second load button under the form`);
    assert.doesNotMatch(src, /You have not read the policy stored now/);
  }
});

// Hyperliquid and Polymarket run open with no policy: the table shows the
// default as allowed, the first change starts from `ownStart`, and the way
// back is one click. A row that needs fields says which, and leads to them.
test('the open default, the way back, and rows that say what they still need', () => {
  assert.match(editor, /const openDefault = schema\.emptyIsOpen === true && isUnrestricted\(value\);/);
  assert.match(editor, /const base = openDefault \? \{ \.\.\.\(schema\.ownStart \?\? \{\}\) \} : value;/);
  assert.match(editor, /onChange\(change\(schema, base, key, v\)\)/, 'fields change from the same base');
  assert.match(editor, /Built-in default:/);
  assert.match(editor, /Back to the built-in default/);
  assert.match(editor, /onClick=\{\(\) => onChange\(\{\}\)\}/);
  assert.match(editor, /runs once/);
  assert.match(editor, /id=\{`policy-field-\$\{field\.key\}`\}/, 'every field has an anchor to be led to');
  assert.match(editor, /const settable = r\.derived && now === 'refused';/);
  assert.match(editor, /set ↓/);
  assert.match(editor, /shownAsRows\(f\)/, 'a switch that is a row is not drawn twice');
});

// A connector with rules gets the list under the table, in the connector's order.
test('the rules list: under the table, numbered, three outcomes, reorderable, conditions in place', () => {
  assert.match(editor, /decision\.ask\?\.kind === 'rules' && decision\.ask\.ruleSpec && \(\s*<RulesList/);
  assert.match(editor, /Rules, checked top to bottom/);
  assert.match(editor, /const THEN_LABEL: Record<RuleThen, string> = \{ allow: 'Auto-approve', ask: 'Manual approval', refuse: 'Refuse' \}/);
  assert.match(editor, /aria-label=\{`Move rule \$\{i \+ 1\} up`\}/);
  assert.match(editor, /\+ condition/);
  assert.match(editor, /\+ Add a rule/);
  // Changing the operation keeps only the conditions it carries.
  assert.match(editor, /conditionsOf\(rule\)\.filter\(\(\[k\]\) => conditionsFor\(op\)\.some/);
});
