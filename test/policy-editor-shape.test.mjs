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

test('the sentence comes first, with the three rules under it', () => {
  const sentence = editor.indexOf('This policy:');
  const rules = editor.indexOf('How a policy decides');
  const bounds = editor.indexOf('grid-template-columns:repeat(auto-fit');
  const table = editor.indexOf('<DecisionTable');
  assert.ok(sentence > 0 && sentence < rules && rules < bounds && bounds < table);
  assert.match(editor, /Your settings decide first/);
  assert.match(editor, /falls to the connector’s own default/);
  assert.match(editor, /Everything else is refused/);
  assert.match(editor, /schema\.emptyIsOpen\s*\?/, 'the open-default exception is named only for connectors that have it');
});

test('the decision table: two columns that exclude each other, a dash where nothing can wait, a whole-group box', () => {
  assert.match(editor, /'Automatically' : 'Ask me first'/);
  assert.match(editor, /now === 'automatic' && !radios \? 'refused' : 'automatic'/);
  assert.match(editor, /now === 'asked' && !radios \? 'automatic' : 'asked'/);
  assert.match(editor, /type=\{radios \? 'radio' : 'checkbox'\}/, 'two outcomes only where nothing can be refused');
  assert.match(editor, /Cannot wait for you/);
  assert.match(editor, /el\.indeterminate = state === 'some'/);
  // Several rows at once are folded over one value, never applied to the same stale one.
  assert.match(editor, /changes\.reduce\(\(v, \[op, d\]\) => decide\(schema, v, op, d\), value\)/);
});

test('sections are numbered and the hierarchy is section > field > default', () => {
  assert.match(editor, /<SectionTitle n=\{i \+ 1\}>/);
  assert.match(editor, /<SectionTitle n=\{bounds\.length \+ 1\}>/);
  assert.match(editor, /text-sm font-semibold text-foreground/, 'the section title is the strongest text');
  assert.match(editor, /text-xs font-medium text-muted-foreground/, 'the field label is lighter');
  assert.match(editor, /text-xs text-faint-foreground">\{field\.absentMeans\}/, 'what empty means is printed, faintest, under the field');
  assert.doesNotMatch(editor, /<fieldset|<legend/, 'no fieldset indentation');
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
  for (const must of ['Automatically', 'Ask me first', 'refused', 'How a policy decides', 'auto-fit', 'First match wins', 'Polymarket', 'Hyperliquid', 'Mercury', 'Gmail', 'GitHub']) {
    assert.ok(design.includes(must), `POLICY_DESIGN.md names ${must}`);
  }
  const base = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  assert.match(base, /POLICY_DESIGN\.md/, 'DESIGN.md points at it');
});
