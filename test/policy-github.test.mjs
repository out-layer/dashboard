// The GitHub policy as the editor writes and reads it. What matters here is
// different from a mail policy: this one FAILS CLOSED, so an empty policy is
// described as "nothing yet" and never as "no limits"; the actions offered are
// exactly the operations the connector sells; a selection that cannot work is
// refused before it is stored; and names are judged by the connector's rules.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { githubPolicy, GITHUB_ACTIONS, githubStartingPolicy, repoProblem, branchProblem, pathProblem } from '../lib/policies/github.ts';
import { toJson, fromJson, validate, isUnrestricted, emptyValue, change } from '../lib/policies/policy.ts';

test('an empty policy allows nothing, and the editor says so', () => {
  assert.equal(toJson(githubPolicy, emptyValue()), '{}');
  assert.ok(isUnrestricted(emptyValue()), 'the helper’s word for "every field empty"');
  assert.match(githubPolicy.emptySummary, /nothing is allowed yet/);
  assert.match(githubPolicy.summarize(emptyValue()), /only ask for the connection’s status/);
});

// The manifest is the connector's own list; a tick-box with no operation
// behind it, or an operation with no tick-box, is a policy nobody can write.
test('the actions offered are the operations the connector sells', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../near-offshore/connectors/github-connector/manifest.json', import.meta.url)));
  const sold = manifest.operations.filter((op) => op !== 'status');
  assert.deepEqual(GITHUB_ACTIONS.map((a) => a.value), sold);
});

test('switches that are off are absent, and the policy round-trips', () => {
  const value = { actions: ['issue_get', 'issue_comment'], repos: ['alice/site'], max_writes_per_day: 20, allow_merge: false, allow_approve: true, marker: '' };
  const json = toJson(githubPolicy, value);
  assert.deepEqual(JSON.parse(json), { actions: ['issue_get', 'issue_comment'], repos: ['alice/site'], max_writes_per_day: 20, allow_approve: true });
  assert.deepEqual(fromJson(githubPolicy, json).value, { actions: ['issue_get', 'issue_comment'], repos: ['alice/site'], max_writes_per_day: 20, allow_approve: true });
});

test('what the connector reports — nulls and false for absent fields — reads back as empty', () => {
  const reported = { actions: null, repos: null, branches: null, paths: null, max_writes_per_day: null, max_files_per_commit: null, allow_merge: null, allow_approve: false, allow_public_gists: null, marker: null };
  assert.ok(isUnrestricted(fromJson(githubPolicy, reported).value));
});

test('a selection that cannot work is refused before it is stored', () => {
  const errors = (v) => validate(githubPolicy, v).join(' | ');
  assert.match(errors({ actions: ['issue_comment'], repos: ['a/b'] }), /Writes a day/);
  assert.match(errors({ actions: ['issue_get'] }), /Repositories/);
  assert.match(errors({ actions: ['commit'], repos: ['a/b'], max_writes_per_day: 5 }), /Branches it may write to/);
  assert.match(errors({ actions: ['pr_merge'], repos: ['a/b'], max_writes_per_day: 5 }), /switch is off/);
  // Gists name no repository, so none is asked for.
  assert.equal(errors({ actions: ['gist_create'], max_writes_per_day: 5 }), '');
  assert.equal(errors({ actions: ['issue_get', 'issue_comment'], repos: ['a/b'], max_writes_per_day: 5 }), '');
  assert.match(errors({ actions: ['delete_repo'], repos: ['a/b'] }), /not something this connector does/);
});

test('names are judged the way the connector judges them', () => {
  for (const ok of ['alice/site', 'out-layer/*', 'any', 'a.b/c_d']) assert.equal(repoProblem(ok), null, ok);
  for (const bad of ['site', 'a/b/c', 'a/', '/b', 'a b/c']) assert.ok(repoProblem(bad), bad);
  for (const ok of ['main', 'agent/*', 'release/1.2']) assert.equal(branchProblem(ok), null, ok);
  for (const bad of ['', '/a', 'a/', 'a..b', 'a b', 'a//b']) assert.ok(branchProblem(bad), bad);
  for (const ok of ['docs/*', 'src/lib/*.ts', 'any']) assert.equal(pathProblem(ok), null, ok);
  for (const bad of ['/etc', 'docs/../x', '.github/workflows/*', '.GitHub/CODEOWNERS', 'a\\b']) assert.ok(pathProblem(bad), bad);
});

test('the sentence says what is permitted, and what never is', () => {
  const said = githubPolicy.summarize({ actions: ['issue_get', 'issue_comment', 'commit'], repos: ['alice/site'], branches: ['agent/*'], paths: ['docs/*'], max_writes_per_day: 20 });
  assert.match(said, /comment and commit several files in alice\/site/);
  assert.match(said, /only on agent\/\*, under docs\/\*/);
  assert.match(said, /at most 20 writes a day/);
  assert.match(said, /never merge, approve and publish a gist, or touch \.github\//);
  assert.match(githubPolicy.summarize({ actions: ['issue_get'], repos: ['any'] }), /may only read in every repository the app reaches/);
});

test('a first connection starts from work that cannot damage a repository', () => {
  const start = githubStartingPolicy('alice', ['alice/site', 'alice/notes']);
  assert.deepEqual(start.repos, ['alice/site', 'alice/notes']);
  for (const risky of ['commit', 'file_put', 'pr_merge', 'pr_create', 'gist_create', 'repo_star']) assert.ok(!start.actions.includes(risky), risky);
  assert.deepEqual(validate(githubPolicy, start), [], 'and it can be stored as it is');
  // Many repositories: the account's pattern rather than a wall of names.
  assert.deepEqual(githubStartingPolicy('alice', Array.from({ length: 30 }, (_, i) => `alice/r${i}`)).repos, ['alice/*']);
  // Nothing reachable and nobody known: no repository is guessed.
  assert.equal(githubStartingPolicy(null, []).repos, undefined);
});

// A switch qualifies an operation: "public gists" is a property of creating a
// gist. Held apart, the switch reads as allowed and does nothing.
test('a switch and the operation it qualifies move together', () => {
  const on = change(githubPolicy, { actions: ['issue_get'] }, 'allow_public_gists', true);
  assert.deepEqual(on.actions, ['issue_get', 'gist_create'], 'turning it on ticks create a gist, in the vocabulary’s order');
  const off = change(githubPolicy, on, 'actions', ['issue_get']);
  assert.equal(off.allow_public_gists, undefined, 'unticking create a gist turns the switch off');
  assert.deepEqual(change(githubPolicy, on, 'allow_public_gists', undefined).actions, ['issue_get', 'gist_create'], 'secret gists stay allowed');
  // A preset or clear that drops the operation drops the switch too.
  assert.equal(change(githubPolicy, on, 'actions', ['repo_list']).allow_public_gists, undefined);
  assert.equal(change(githubPolicy, on, 'actions', undefined).allow_public_gists, undefined);
  assert.deepEqual(change(githubPolicy, {}, 'allow_approve', true).actions, ['pr_review']);
  // Merge is one decision: the operation does nothing without the switch.
  const merge = change(githubPolicy, { actions: ['pr_get'] }, 'actions', ['pr_get', 'pr_merge']);
  assert.equal(merge.allow_merge, true, 'ticking merge turns its switch on');
  assert.deepEqual(change(githubPolicy, merge, 'allow_merge', undefined).actions, ['pr_get'], 'and turning it off unticks merge');
});

test('a stored switch with nothing to act on is flagged, and the sentence does not claim it', () => {
  const apart = { actions: ['issue_get'], repos: ['a/b'], allow_public_gists: true, allow_approve: true };
  const errors = validate(githubPolicy, apart).join(' | ');
  assert.match(errors, /"Public gists" is on, but "create a gist" is not ticked/);
  assert.match(errors, /"Approve pull requests in your name" is on, but "review" is not ticked/);
  assert.match(githubPolicy.summarize(apart), /never merge, approve and publish a gist/);
  const together = { actions: ['gist_create'], max_writes_per_day: 5, allow_public_gists: true };
  assert.deepEqual(validate(githubPolicy, together), []);
  assert.match(githubPolicy.summarize(together), /never merge and approve,/);
});
