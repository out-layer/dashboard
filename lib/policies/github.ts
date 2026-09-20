import type { Choice, PolicySchema, PolicyValue } from './types';

/**
 * The GitHub connector's policy — the owner's rule for what an agent may do in
 * their account, under their name. Mirrors
 * `connectors/github-connector/src/policy.rs`: the keys, what absence means,
 * and the shape of a name it accepts.
 *
 * Unlike a mail policy this one FAILS CLOSED. Nothing but `status` runs until
 * something is allowed, because reading a private repository is already a
 * disclosure — so `actions` and the two switches grant, and an empty policy is
 * described as "nothing yet", never as "no limits".
 *
 * `marker` is offered as a replacement only. The connector adds its own line to
 * everything the agent posts under the owner's name, and an owner who wants
 * none of it sets `"marker": ""` by hand; a checkbox that removes the one thing
 * telling a reader the words were not the owner's is not something to offer.
 */

const READ = 'Read';
const ISSUES = 'Issues';
const CODE = 'Files and branches';
const PULLS = 'Pull requests';
const GISTS = 'Gists';
const STARS = 'Stars';

/** Every operation the connector sells but `status`, which no policy governs. In the manifest's order. */
export const GITHUB_ACTIONS: Choice[] = [
  { value: 'repo_list', label: 'list repositories', group: READ },
  { value: 'repo_get', label: 'repository details', group: READ },
  { value: 'dir_list', label: 'list a directory', group: READ },
  { value: 'file_get', label: 'read a file', group: READ },
  { value: 'branch_list', label: 'list branches', group: READ },
  { value: 'issue_list', label: 'list issues', group: READ },
  { value: 'issue_get', label: 'read an issue and its comments', group: READ },
  { value: 'pr_list', label: 'list pull requests', group: READ },
  { value: 'pr_get', label: 'read a pull request', group: READ },
  { value: 'pr_files', label: 'read its changes', group: READ },
  { value: 'gist_list', label: 'list gists', group: READ },
  { value: 'gist_get', label: 'read a gist', group: READ },
  { value: 'branch_create', label: 'create a branch', group: CODE },
  { value: 'file_put', label: 'write one file', group: CODE },
  { value: 'commit', label: 'commit several files', group: CODE },
  { value: 'issue_create', label: 'open an issue', group: ISSUES },
  { value: 'issue_comment', label: 'comment', group: ISSUES },
  { value: 'issue_update', label: 'retitle, label, close', group: ISSUES },
  { value: 'pr_create', label: 'open a pull request', group: PULLS },
  { value: 'pr_review', label: 'review', group: PULLS },
  { value: 'pr_merge', label: 'merge (needs the switch below)', group: PULLS },
  { value: 'gist_create', label: 'create a gist', group: GISTS },
  { value: 'gist_update', label: 'change a gist', group: GISTS },
  { value: 'repo_star', label: 'star', group: STARS },
  { value: 'repo_unstar', label: 'unstar', group: STARS },
];

const reads = GITHUB_ACTIONS.filter((a) => a.group === READ).map((a) => a.value);
/** What can only happen on a branch the policy names. */
const NEEDS_BRANCH = ['branch_create', 'file_put', 'commit', 'pr_create'];
/** What is not tied to a repository, so `repos` does not bound it. */
const NO_REPO = ['gist_list', 'gist_get', 'gist_create', 'gist_update'];

function isRead(action: string): boolean {
  return reads.includes(action);
}

/** `owner/name` or `owner/*`, in GitHub's characters — the connector compares without regard to case. */
export function repoProblem(entry: string): string | null {
  const repo = entry.trim();
  if (repo.toLowerCase() === 'any') return null;
  const part = /^[A-Za-z0-9_.-]+$/;
  const [owner, name, ...rest] = repo.split('/');
  if (rest.length > 0 || !owner || !name || !part.test(owner) || !(name === '*' || /^[A-Za-z0-9_.*-]+$/.test(name))) {
    return `"${entry}" is not a repository — write owner/name, or owner/* for all of an account's`;
  }
  return null;
}

/** A branch or a pattern with `*`: what a git ref may hold, and nothing that climbs out of it. */
export function branchProblem(entry: string): string | null {
  const b = entry.trim();
  const ok = b.length > 0 && b.length <= 200 && /^[A-Za-z0-9_.\/*-]+$/.test(b) && !b.includes('..') && !b.includes('//') && !b.startsWith('/') && !b.endsWith('/');
  return ok ? null : `"${entry}" is not a branch name or pattern — letters, digits, - _ . / and * only`;
}

/** A relative path or pattern. `.github/` is refused by the connector whatever is written here, so it is refused here too. */
export function pathProblem(entry: string): string | null {
  const p = entry.trim();
  if (p.toLowerCase() === 'any') return null;
  if (!p || p.startsWith('/') || p.includes('\\') || p.includes('..') || p.includes('//')) {
    return `"${entry}" is not a relative path or pattern — docs/* or src/lib/*.ts`;
  }
  if (p.split('/')[0].toLowerCase() === '.github') {
    return `"${entry}": the connector never writes under .github/, whatever a policy says`;
  }
  return null;
}

function list(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v : [];
}

/** "a", "a and b", "a, b and c". */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const githubPolicy: PolicySchema = {
  connector: 'github',
  envKey: 'GITHUB_POLICY',
  emptySummary: 'nothing is allowed yet — the agent can only ask for the connection’s status',
  groups: [
    {
      question: 'What may it do?',
      fields: [
        {
          key: 'actions',
          label: 'Actions',
          kind: 'choices',
          help: 'Each is one operation of the connector. The agent can run only what is ticked; a new operation added later is NOT included until you tick it.',
          absentMeans: 'Nothing ticked: the agent cannot read or write anything.',
          options: GITHUB_ACTIONS,
          presets: [
            { label: 'Read only', values: reads },
            { label: 'Issues and reviews', values: [...reads, 'issue_create', 'issue_comment', 'issue_update', 'pr_review'] },
            { label: 'Contributor (through pull requests)', values: [...reads, 'issue_create', 'issue_comment', 'branch_create', 'commit', 'file_put', 'pr_create', 'pr_review'] },
            { label: 'Gists only', values: ['gist_list', 'gist_get', 'gist_create', 'gist_update'] },
          ],
        },
      ],
    },
    {
      question: 'Where?',
      fields: [
        {
          key: 'repos',
          label: 'Repositories',
          kind: 'list',
          help: 'owner/name, or owner/* for every repository of an account. This narrows what you already chose on GitHub when installing the app; it cannot add a repository the app was not installed on.',
          absentMeans: 'None: nothing that names a repository will run. Write "any" for every repository the app reaches.',
          placeholder: 'owner/name',
          normalize: (e) => e.trim(),
          validateEntry: repoProblem,
        },
        {
          key: 'branches',
          label: 'Branches it may write to',
          kind: 'list',
          help: 'Where files may be written and pull requests opened from. A pattern such as agent/* never reaches a repository’s default branch — to allow writing to main, name it exactly.',
          absentMeans: 'None: no file is written and no pull request opened. agent/* is the usual choice.',
          placeholder: 'agent/*',
          normalize: (e) => e.trim(),
          validateEntry: branchProblem,
        },
        {
          key: 'paths',
          label: 'Paths it may write',
          kind: 'list',
          help: 'Patterns for the files it may create or change, e.g. docs/*. A * matches anything, slashes included. The .github/ directory is never written, whatever is here.',
          absentMeans: 'Any path on the branches above — except .github/, which is never written.',
          placeholder: 'docs/*',
          normalize: (e) => e.trim(),
          validateEntry: pathProblem,
        },
      ],
    },
    {
      question: 'How much?',
      fields: [
        {
          key: 'max_writes_per_day',
          label: 'Writes a day',
          kind: 'number',
          unit: 'writes, all kinds together',
          help: 'Every issue, comment, commit, review and gist counts as one. Counted per calling agent, in UTC days. A write GitHub refused does not count.',
          absentMeans: 'Not set: nothing is written at all. Reading is not limited by this.',
          min: 1,
        },
        {
          key: 'max_files_per_commit',
          label: 'Files in one commit',
          kind: 'number',
          unit: 'files (at most 20)',
          help: 'How many files one commit may create, change or delete.',
          absentMeans: 'Ten.',
          min: 1,
        },
      ],
    },
    {
      question: 'The three things that are off unless you say so',
      fields: [
        {
          key: 'allow_merge',
          label: 'Merge pull requests',
          kind: 'toggle',
          help: 'A merge puts the agent’s work into a branch nobody re-read. GitHub would let it; only this switch stops it.',
          absentMeans: 'Off: the agent opens pull requests and you merge them.',
        },
        {
          key: 'allow_approve',
          label: 'Approve pull requests in your name',
          kind: 'toggle',
          help: 'An approval under your name can satisfy a branch protection rule. Without this a review can still comment or request changes.',
          absentMeans: 'Off: a review comments or requests changes, and never approves.',
        },
        {
          key: 'allow_public_gists',
          label: 'Public gists',
          kind: 'toggle',
          help: 'A public gist is readable by anyone and indexed by search engines, and cannot be made secret again.',
          absentMeans: 'Off: every gist the agent creates is secret.',
        },
      ],
    },
    {
      question: 'How are its words told from yours?',
      fields: [
        {
          key: 'marker',
          label: 'Line added to what it posts',
          kind: 'text',
          help: 'Everything the agent posts appears under YOUR name. This line is added to each issue, comment and review so a reader can tell it was not you.',
          absentMeans: 'The default line: “— posted by an AI agent via OutLayer”.',
          placeholder: '— my assistant',
        },
      ],
    },
  ],

  check(value: PolicyValue): string[] {
    const actions = list(value.actions);
    const problems: string[] = [];
    const writes = actions.filter((a) => !isRead(a));
    if (writes.length > 0 && typeof value.max_writes_per_day !== 'number') {
      problems.push('Writes a day: set a number — without it none of the write actions you ticked will run');
    }
    if (actions.some((a) => !NO_REPO.includes(a)) && list(value.repos).length === 0) {
      problems.push('Repositories: name at least one (or "any") — the actions you ticked all need a repository');
    }
    if (actions.some((a) => NEEDS_BRANCH.includes(a)) && list(value.branches).length === 0) {
      problems.push('Branches it may write to: name one (agent/* is usual) — writing files and opening pull requests need it');
    }
    if (actions.includes('pr_merge') && value.allow_merge !== true) {
      problems.push('Merge is ticked but its switch is off — turn on "Merge pull requests", or untick merge');
    }
    const max = value.max_files_per_commit;
    if (typeof max === 'number' && max > 20) problems.push('Files in one commit: at most 20');
    return problems;
  },

  summarize(value: PolicyValue): string {
    const actions = list(value.actions);
    if (actions.length === 0) return 'The agent can only ask for the connection’s status.';
    const writes = actions.filter((a) => !isRead(a));
    const label = (a: string) => GITHUB_ACTIONS.find((o) => o.value === a)?.label.replace(/ \(.*\)$/, '') ?? a;
    const repos = list(value.repos);
    const where = repos.length === 0 ? '' : repos.some((r) => r.toLowerCase() === 'any') ? ' in every repository the app reaches' : ` in ${joinAnd(repos)}`;

    const parts: string[] = [];
    if (writes.length === 0) {
      parts.push(`The agent may only read${where}`);
    } else {
      parts.push(`The agent may read, and ${joinAnd(writes.map(label))}${where}`);
      const branches = list(value.branches);
      if (branches.length > 0 && writes.some((a) => NEEDS_BRANCH.includes(a))) {
        const paths = list(value.paths);
        parts.push(`writing files only on ${joinAnd(branches)}${paths.length > 0 && !paths.some((p) => p.toLowerCase() === 'any') ? `, under ${joinAnd(paths)}` : ''}`);
      }
      if (typeof value.max_writes_per_day === 'number') parts.push(`at most ${value.max_writes_per_day} writes a day`);
    }
    const never: string[] = [];
    if (value.allow_merge !== true) never.push('merge');
    if (value.allow_approve !== true) never.push('approve');
    if (value.allow_public_gists !== true) never.push('publish a gist');
    const tail = never.length > 0 ? ` It can never ${joinAnd(never)}, or touch .github/.` : ' It can never touch .github/.';
    return `${parts.join(', ')}.${tail}`;
  },
};

/**
 * Where a first connection starts, given what the credential reaches. Reading,
 * issues and reviews — the work that cannot damage a repository — in exactly
 * the repositories the owner just picked on GitHub, with a modest daily number.
 * A starting point the owner edits before anything is stored, never a default
 * applied behind them.
 */
export function githubStartingPolicy(login: string | null, reachable: string[]): PolicyValue {
  const repos = reachable.length > 0 && reachable.length <= 10 ? reachable : login ? [`${login}/*`] : [];
  return {
    actions: GITHUB_ACTIONS.map((a) => a.value).filter((a) => isRead(a) || ['issue_create', 'issue_comment', 'issue_update', 'pr_review'].includes(a)),
    repos: repos.length > 0 ? repos : undefined,
    max_writes_per_day: 30,
  };
}
