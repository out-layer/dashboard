// The secrets screen's access decisions: a new Project row defaults to
// Whitelist[self]; update mode carries the stored condition and keeps it; a
// link's stored condition applies only while the form targets the link's row;
// AllowAll carries the "anyone who names this secret…" warning; the notice
// covers existing Project rows stored AllowAll and nothing else. The wiring
// checks read the component sources, so a screen that stops calling these
// functions fails here rather than silently re-deciding on its own.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialAccess, linkedAccessFor, ALLOW_ALL_WARNING, openPersonalRows, chainReadLeaves, chainReadRefusal } from '../app/secrets/components/utils.ts';

const ME = 'me.near';
const project = (id, access) => ({ accessor: { Project: { project_id: id } }, access, profile: 'p' });
const repo = (access) => ({ accessor: { Repo: { repo: 'https://github.com/x/y' } }, access, profile: 'p' });

test('UI1 a new Project row defaults to Whitelist[connected account]', () => {
  const { condition, kept } = initialAccess({ sourceType: 'project', accountId: ME });
  assert.deepEqual(condition, { type: 'Whitelist', accounts: [ME] });
  assert.equal(kept, null);
});

test('UI1 repository- and hash-bound rows stay open (AllowAll)', () => {
  assert.deepEqual(initialAccess({ sourceType: 'repo', accountId: ME }).condition, { type: 'AllowAll' });
  assert.deepEqual(initialAccess({ sourceType: 'wasm_hash', accountId: ME }).condition, { type: 'AllowAll' });
});

test('UI1 with no connected account there is no one to whitelist', () => {
  assert.deepEqual(initialAccess({ sourceType: 'project', accountId: null }).condition, { type: 'AllowAll' });
});

test('UI2 a stored whitelist is carried, not replaced by the default', () => {
  const stored = { Whitelist: { accounts: ['other.near'] } };
  const { condition } = initialAccess({ sourceType: 'project', accountId: ME, storedAccess: stored });
  assert.deepEqual(condition, { type: 'Whitelist', accounts: ['other.near'] });
});

test("UI2 an app's stored AllowAll is kept — the default must not narrow it to the author", () => {
  const { condition } = initialAccess({ sourceType: 'project', accountId: ME, storedAccess: 'AllowAll' });
  assert.deepEqual(condition, { type: 'AllowAll' });
});

test('UI2 a stored shape this UI cannot render is kept verbatim, never replaced', () => {
  const stored = { SomethingNewer: { x: 1 } };
  const { condition, kept } = initialAccess({ sourceType: 'project', accountId: ME, storedAccess: stored });
  assert.equal(condition, null);
  assert.deepEqual(kept, stored);
});

// A link lands on an existing row (typically an app's AllowAll credential).
// Its condition is the starting point only while the form targets THAT row.
const LINK = { projectId: 'app.near/mail', profile: 'author' };
const linked = (form) => linkedAccessFor({ link: LINK, storedAccess: 'AllowAll', ...form });

test("a link's stored condition applies while the form targets the link's row", () => {
  assert.equal(linked({ sourceType: 'project', projectId: 'app.near/mail', profile: 'author' }), 'AllowAll');
});

test("retargeting the project drops the link's condition — a new row starts from the default", () => {
  assert.equal(linked({ sourceType: 'project', projectId: 'me.near/other', profile: 'author' }), undefined);
  const { condition } = initialAccess({ sourceType: 'project', accountId: ME, storedAccess: linked({ sourceType: 'project', projectId: 'me.near/other', profile: 'author' }) });
  assert.deepEqual(condition, { type: 'Whitelist', accounts: [ME] });
});

test("retargeting the profile, or the accessor kind, drops it too", () => {
  assert.equal(linked({ sourceType: 'project', projectId: 'app.near/mail', profile: 'mine' }), undefined);
  assert.equal(linked({ sourceType: 'repo', projectId: 'app.near/mail', profile: 'author' }), undefined);
});

test("a stray space is not a retarget: the save trims, so does the comparison", () => {
  assert.equal(linked({ sourceType: 'project', projectId: 'app.near/mail ', profile: ' author' }), 'AllowAll');
});

test('without a link, or without a stored row, there is nothing to carry', () => {
  // No link: the form passes the object with both strings absent, and the
  // form's own target is not the empty one.
  assert.equal(linkedAccessFor({ link: {}, storedAccess: 'AllowAll', sourceType: 'project', projectId: 'me.near/app', profile: 'default' }), undefined);
  assert.equal(linkedAccessFor({ link: LINK, storedAccess: undefined, sourceType: 'project', projectId: 'app.near/mail', profile: 'author' }), undefined);
});

test('UI4 the AllowAll choice warns that anyone who names the secret can run the project', () => {
  assert.match(ALLOW_ALL_WARNING, /anyone who names this secret/i);
  assert.match(ALLOW_ALL_WARNING, /whitelist/i);
});

test('UI5 the notice covers Project rows stored AllowAll, and nothing else', () => {
  const rows = [
    project('me.near/app', 'AllowAll'),
    project('me.near/app', { Whitelist: { accounts: [ME] } }),
    repo('AllowAll'),
    { accessor: undefined, access: 'AllowAll', profile: 'p' },
  ];
  assert.deepEqual(openPersonalRows(rows), [rows[0]]);
});

test('wiring: the form, the page and the builder decide through this module', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const form = src('../app/secrets/components/SecretsForm.tsx');
  const page = src('../app/secrets/page.tsx');
  // Call sites, not imports: an import can sit unused (nothing here runs
  // eslint), a call cannot.
  assert.match(form, /const \{ condition, kept \} = initialAccess\(\{ sourceType, accountId, storedAccess \}\)/);
  assert.match(form, /const storedAccess = linkedAccessFor\(\{/);
  assert.match(form, /= carriedAccess\(raw\)/);
  assert.match(page, /openPersonalRows\(userSecrets\)/);
  // A link with a project and no profile lands on `default`, the form's own:
  // the row it may overwrite and the row whose condition it carries.
  assert.match(page, /s\.profile === linkEffectiveProfile/);
  assert.match(page, /profile: linkEffectiveProfile/);
  assert.match(src('../app/secrets/components/AccessConditionBuilder.tsx'), /description: ALLOW_ALL_WARNING/);
});

test('a condition is refused before signing when it asks the chain more than five times', () => {
  const read = { NearBalance: { operator: 'Gte', value: '1' } };
  const or = (n) => ({ Logic: { operator: 'Or', conditions: Array.from({ length: n }, () => read) } });

  assert.equal(chainReadLeaves(or(5)), 5);
  assert.equal(chainReadRefusal(or(5)), null, 'five is the bound, not past it');

  const refusal = chainReadRefusal(or(6));
  assert.ok(refusal && refusal.includes('6 times'), `names the count: ${refusal}`);

  // Every kind counts, wherever it sits — under Not, under nested Logic.
  const mixed = { Not: { condition: { Logic: { operator: 'And', conditions: [
    { FtBalance: { contract: 'ft.near', operator: 'Gte', value: '1' } },
    { NftOwned: { contract: 'nft.near', token_id: null } },
    { DaoMember: { dao_contract: 'dao.near', role: 'council' } },
    { NearBalance: { operator: 'Gte', value: '1' } },
    { NftOwned: { contract: 'nft.near', token_id: '2' } },
    { DaoMember: { dao_contract: 'dao.near', role: 'members' } },
  ] } } } };
  assert.ok(chainReadRefusal(mixed)?.includes('6 times'));

  // A whitelist of any size asks the chain nothing.
  const wide = { Whitelist: { accounts: Array.from({ length: 500 }, (_, i) => `a${i}.near`) } };
  assert.equal(chainReadLeaves(wide), 0);
  assert.equal(chainReadRefusal(wide), null);
});
