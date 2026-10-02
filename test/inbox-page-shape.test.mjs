// The shape of the inbox's sources, read as text: what a task carries is
// drawn as text and never as markup, a link or an address to load; a file is
// handed over as a download of no type; and the wallet is opened from a click.
//
// These hold the source to a shape. They do not render it: what a browser
// does with the page is checked in a browser.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sourcesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourcesUnder(path));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found.sort();
}

/** The source without its comments, each replaced by spaces so that every place keeps its offset. */
function code(path) {
  const text = readFileSync(join(ROOT, path), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w\\/])\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, ' '));
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const where = (path, text, at) => `${relative(ROOT, join(ROOT, path))}:${lineOf(text, at)}`;

/**
 * The end of what opens at `text[at]` — a `(` or a `{` — past its match.
 * Strings, template literals and their `${}` are stepped over.
 */
function closes(text, at) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  let i = at;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      i += 1;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    } else if (c === '`') {
      i += 1;
      while (i < text.length && text[i] !== '`') {
        if (text[i] === '\\') i += 2;
        else if (text[i] === '$' && text[i + 1] === '{') i = closes(text, i + 1);
        else i += 1;
      }
    } else if (pairs[c]) {
      stack.push(pairs[c]);
    } else if (c === ')' || c === '}' || c === ']') {
      assert.equal(c, stack.pop(), `brackets do not match at offset ${i}`);
      if (stack.length === 0) return i + 1;
    }
    i += 1;
  }
  assert.fail(`what opens at offset ${at} is not closed`);
}

const PAGES = sourcesUnder('app/inbox').filter((path) => /(^|\/)page\.tsx$/.test(path));
const COMPONENTS = sourcesUnder('components/inbox');
const CARD = 'components/inbox/TaskCard.tsx';
const CONTEXT = 'contexts/InboxContext.tsx';
/** Every source that draws the inbox. */
const DRAWN = [...COMPONENTS, ...sourcesUnder('app/inbox')];

test('the sources the shape is held over are the ones that draw the inbox', () => {
  assert.ok(COMPONENTS.includes(CARD));
  assert.ok(PAGES.includes('app/inbox/[[...id]]/page.tsx'));
  assert.ok(PAGES.includes('app/inbox/settings/page.tsx'));
  // The reader of sources sees what it is held to see: a comment is no code, a URL in a string is.
  const sample = "const a = 'https://x'; // <img src=x>\n/* <iframe> */ const b = 'https://y';";
  const read = sample.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w\\/])\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '));
  assert.ok(!read.includes('<img') && !read.includes('<iframe'));
  assert.ok(read.includes("'https://x'") && read.includes("'https://y'"));
});

// D12

test('nothing in the inbox is drawn as markup', () => {
  const markup = [
    'dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'srcDoc',
    'createContextualFragment', 'DOMParser',
  ];
  for (const path of DRAWN) {
    // Comments included: the word has no business in these files at all.
    const text = readFileSync(join(ROOT, path), 'utf8');
    for (const word of markup) assert.ok(!text.includes(word), `${path} holds ${word}`);
  }
});

test('the inbox draws no element that loads an address or opens one', () => {
  // An element of the page itself: `<a`, `<img` and the rest, as JSX or as text handed to the DOM.
  const element = /<\s*(a|img|image|picture|source|iframe|frame|video|audio|track|object|embed|link|script|base|form|use)(?=[\s>/])/g;
  for (const path of DRAWN) {
    const text = code(path);
    for (const found of text.matchAll(element)) {
      assert.fail(`${where(path, text, found.index)} draws <${found[1]}`);
    }
    for (const attribute of [/\bsrc\s*=/g, /\bsrcSet\s*=/gi, /\bposter\s*=/g, /\bformAction\s*=/g, /\baction\s*=\s*[{"']/g, /\bxlinkHref\b/g]) {
      for (const found of text.matchAll(attribute)) {
        assert.fail(`${where(path, text, found.index)} names an address to load: ${found[0]}`);
      }
    }
    for (const call of [/\bwindow\.open\s*\(/g, /\blocation\.(href|assign|replace)\b/g, /\bwindow\.location\s*=/g]) {
      for (const found of text.matchAll(call)) {
        assert.fail(`${where(path, text, found.index)} goes to an address: ${found[0]}`);
      }
    }
  }
});

test('the only element made by hand is the link that hands a file over', () => {
  const made = [];
  for (const path of DRAWN) {
    const text = code(path);
    for (const found of text.matchAll(/\bcreateElement(NS)?\s*\(([^)]*)\)/g)) made.push([path, found[2].trim()]);
  }
  assert.deepEqual(made, [[CARD, "'a'"]]);
});

/**
 * Every `href` of the inbox is one of three, and nothing else:
 *
 *   1. a JSX attribute whose value is a string literal that is a path of this
 *      site: `href="/…"`, with no `//` at its start;
 *   2. a JSX attribute whose value is a template literal that starts with a
 *      path of this site, and whose every `${…}` is exactly `task.id` or
 *      `approval.id`;
 *   3. in the card, `link.href = url`, where `url` is
 *      `URL.createObjectURL(new Blob(…))` of the statement before it: bytes
 *      this page holds, and no address.
 */
test('no link of the inbox is built from what a task carries', () => {
  // An id, as it is or encoded as one segment of a path.
  const ids = ['task.id', 'approval.id', 'encodeURIComponent(task.id)', 'encodeURIComponent(approval.id)'];
  const seen = { literal: 0, byId: 0, download: 0 };
  for (const path of DRAWN) {
    const text = code(path);
    for (const found of text.matchAll(/\bhref\b/g)) {
      const at = found.index;
      const here = where(path, text, at);
      const after = text.slice(at + 4);
      const literal = /^="([^"]*)"/.exec(after);
      const template = /^=\{`([^`]*)`\}/.exec(after);
      if (literal) {
        assert.match(literal[1], /^\/(?!\/)[a-z0-9/_-]*$/, `${here}: a literal that is a path of this site`);
        seen.literal += 1;
      } else if (template) {
        assert.match(template[1], /^\/(?!\/)/, `${here}: starts with a path of this site`);
        const holes = [...template[1].matchAll(/\$\{([^}]*)\}/g)].map((hole) => hole[1].trim());
        assert.ok(holes.length > 0, here);
        for (const hole of holes) assert.ok(ids.includes(hole), `${here}: built from ${hole}`);
        const fixed = template[1].replace(/\$\{[^}]*\}/g, '');
        assert.match(fixed, /^[a-z0-9/_-]*$/, `${here}: the rest of it is a path`);
        seen.byId += 1;
      } else {
        assert.equal(path, CARD, `${here}: an href that is neither a literal nor built from an id`);
        assert.equal(text.slice(at - 5, at + 11), 'link.href = url;', here);
        const before = text.slice(0, at).trimEnd().split('\n');
        assert.match(before.at(-3), /^\s*const url = URL\.createObjectURL\(new Blob\(/, `${here}: the address of bytes this page holds`);
        assert.match(before.at(-2), /^\s*const link = document\.createElement\('a'\);$/, here);
        seen.download += 1;
      }
    }
  }
  assert.ok(seen.literal > 0, 'the inbox links to its own pages');
  assert.equal(seen.download, 1);
});

test('a file is handed over as a download of no type, under a name that is no path', () => {
  const blobs = [];
  for (const path of DRAWN) {
    const text = code(path);
    for (const found of text.matchAll(/\bnew\s+(Blob|File)\s*\(/g)) {
      const open = found.index + found[0].length - 1;
      blobs.push([path, found[1], text.slice(open, closes(text, open))]);
    }
    assert.ok(!/\bFileReader\b|\breadAsDataURL\b|data:[a-z]+\//.test(text), `${path} makes no address of a file's bytes`);
  }
  assert.equal(blobs.length, 1);
  const [[path, kind, given]] = blobs;
  assert.equal(path, CARD);
  assert.equal(kind, 'Blob');
  assert.match(given, /,\s*\{\s*type:\s*'application\/octet-stream'\s*\}\s*\)$/);
  assert.ok(!given.includes('content_type'), 'never the type the task names');

  const card = code(CARD);
  assert.match(card, /link\.download = saveName\(note\.name\);/);
  assert.equal([...card.matchAll(/\.download\s*=/g)].length, 1);
  assert.equal([...card.matchAll(/\bcreateObjectURL\s*\(/g)].length, 1);
  assert.match(card, /URL\.revokeObjectURL\(url\);/);
  // The type a task names for a file is drawn as words, and is no type of anything.
  for (const found of card.matchAll(/\bcontent_type\b/g)) {
    const line = card.split('\n')[lineOf(card, found.index) - 1];
    assert.match(line, /^\s*\{file\.content_type\} · \{size\(file\.size\)\}\s*$/, `${where(CARD, card, found.index)}`);
  }
});

// E8, as far as the source says it

test('only a task in the state open is drawn as open or counted by the bell', () => {
  const context = code(CONTEXT);
  assert.match(context, /const waiting = tasks\.filter\(\(t\) => t\.state === 'open'\)\.length \+ approvals\.length;/);
  assert.match(context, /count: session === 'active' \? waiting : 0,/);
  assert.match(code(CARD), /const open = task\.state === 'open';/);
  // The card also knows `approved` — still waiting, still readable, acted on
  // by nobody here — and nothing else: a state is `open`, `approved`, or not
  // drawn as waiting.
  assert.match(code(CARD), /const approved = task\.state === 'approved';/);
  for (const path of [CONTEXT, ...DRAWN]) {
    const text = code(path);
    for (const found of text.matchAll(/\.state\s*(!==?|===?)\s*('[^']*'|[\w.$]+)/g)) {
      const allowed = path === CARD ? ["'open'", "'approved'", "'failed'"] : ["'open'"];
      assert.equal(found[1], '===', where(path, text, found.index));
      assert.ok(allowed.includes(found[2]), `${where(path, text, found.index)}: compares the state to ${found[2]}`);
    }
  }
  // `'failed'` is compared once: the approve's answer, never a listed task.
  assert.equal([...code(CARD).matchAll(/\.state === 'failed'/g)].length, 1);
  // What the card says of the two states the approval adds: approved is being
  // carried out, and a failed task says why, in words.
  assert.match(code(CARD), /approved: 'Sent',/);
  assert.match(code(CARD), /Failed: \{failureWords\(task\.failure_reason\)\}\./);
  assert.match(code(CARD), /unknown: 'In a state this page does not know',/);
});

// The wallet is opened from a click

/** Every `useEffect(…)` of a source: where it starts and what it holds. */
function effects(path) {
  const text = code(path);
  return [...text.matchAll(/\buseEffect\s*\(/g)].map((found) => {
    const open = found.index + found[0].length - 1;
    return { at: where(path, text, found.index), body: text.slice(open, closes(text, open)) };
  });
}

test('the wallet signs the statement inside signIn, and nowhere else', () => {
  const text = code(CONTEXT);
  const starts = [...text.matchAll(/const signIn = useCallback\s*\(/g)];
  assert.equal(starts.length, 1);
  const open = starts[0].index + starts[0][0].length - 1;
  const end = closes(text, open);
  const signs = [...text.matchAll(/\bsignMessage\s*\(/g)];
  assert.equal(signs.length, 1);
  for (const sign of signs) {
    assert.ok(sign.index > open && sign.index < end, `${where(CONTEXT, text, sign.index)} is outside signIn`);
  }
  // Every other mention takes the function from the wallet or lists it; none calls it.
  const mentions = [...text.matchAll(/\bsignMessage\b/g)].filter((m) => m.index < open || m.index >= end);
  assert.deepEqual(
    mentions.map((m) => text.split('\n')[lineOf(text, m.index) - 1].trim()),
    ['const { accountId, isConnected, network, contractId, viewMethod, signMessage } = useNearWallet();'],
  );
  assert.match(text.slice(open, end), /\}, \[accountId, contractId, coordinatorUrl, network, signMessage\]\)$/);
  // Of the drawn sources only the settings and the card sign a message: the
  // settings for the three actions a session must not do alone, inside
  // `useConfirmation` and from a click; the card to approve a task, inside
  // `approve` and from its button. Nothing sends a transaction to answer.
  const SETTINGS = 'app/inbox/settings/page.tsx';
  for (const path of DRAWN) {
    if (path === SETTINGS || path === CARD) continue;
    assert.ok(!/\bsignMessage\b/.test(code(path)), `${path} names signMessage`);
  }
  const card = code(CARD);
  const approve = [...card.matchAll(/const approve = \(\) =>\s*within\('approve', async \(\) => \{/g)];
  assert.equal(approve.length, 1);
  const approveEnd = closes(card, approve[0].index + approve[0][0].length - 1);
  const signsInCard = [...card.matchAll(/\bsignMessage\s*\(/g)];
  assert.equal(signsInCard.length, 1);
  assert.ok(signsInCard[0].index > approve[0].index && signsInCard[0].index < approveEnd, 'signed inside approve');
  assert.deepEqual(
    [...card.matchAll(/\bsignMessage\b/g)].filter((m) => m.index < approve[0].index || m.index >= approveEnd).map((m) => card.split('\n')[lineOf(card, m.index) - 1].trim()),
    ['const { accountId, contractId, network, viewMethod, signMessage } = useNearWallet();'],
  );
  assert.ok(!/\bsignAndSendTransactions?\b/.test(card), 'the card sends no transaction');
  const approveCalls = [...card.matchAll(/(?<![\w$.])approve\s*\(/g)].filter((m) => m.index < approve[0].index || m.index >= approveEnd);
  assert.deepEqual(approveCalls.map((m) => card.split('\n')[lineOf(card, m.index) - 1].trim()), ['<Button onClick={() => void approve()} disabled={busy !== null || !mayAct}>']);
  const settings = code(SETTINGS);
  const hook = [...settings.matchAll(/function useConfirmation\(\) \{/g)];
  assert.equal(hook.length, 1);
  const hookEnd = closes(settings, hook[0].index + hook[0][0].length - 1);
  const signsInSettings = [...settings.matchAll(/\bsignMessage\s*\(/g)];
  assert.equal(signsInSettings.length, 1);
  assert.ok(signsInSettings[0].index > hook[0].index && signsInSettings[0].index < hookEnd, 'signed inside useConfirmation');
  // The confirmation is asked for only inside the work a click starts.
  for (const asked of settings.matchAll(/await confirm\(/g)) {
    const before = settings.slice(0, asked.index);
    const click = before.lastIndexOf('onClick={');
    const change = before.lastIndexOf('void change(');
    const save = before.lastIndexOf('const save = () => {');
    assert.ok(click > 0 || save > 0, `${where(SETTINGS, settings, asked.index)}: a confirmation outside a click`);
    assert.ok(change > Math.max(click, save) || save > click, `${where(SETTINGS, settings, asked.index)}: not within the click's work`);
  }
});

test('no effect signs in, signs a message or sends a transaction', () => {
  const sources = [...sourcesUnder('contexts'), ...DRAWN];
  assert.ok(sources.includes(CONTEXT));
  let read = 0;
  for (const path of sources) {
    const found = effects(path);
    assert.equal(found.length, [...code(path).matchAll(/\buseEffect\s*\(/g)].length);
    for (const effect of found) {
      read += 1;
      assert.match(effect.body, /^\(\s*\(\s*\)\s*=>/, `${effect.at} is an effect`);
      for (const opens of [/(?<![\w$])signIn\s*\(/, /\bsignMessage\s*\(/, /\bsignAndSendTransactions?\s*\(/, /\bsignInAndSignMessage\s*\(/]) {
        assert.ok(!opens.test(effect.body), `${effect.at} calls ${opens.source}`);
      }
    }
  }
  assert.ok(read >= 8, 'the effects of the inbox were read');
});

test('nothing a timer, a promise chain or a message from another tab runs signs in', () => {
  for (const path of [CONTEXT, ...DRAWN]) {
    const text = code(path);
    for (const starts of [/\bset(Timeout|Interval)\s*\(/g, /\.then\s*\(/g, /\.catch\s*\(/g, /\.finally\s*\(/g, /\.onmessage\s*=\s*\(/g, /\baddEventListener\s*\(/g]) {
      for (const found of text.matchAll(starts)) {
        const open = found.index + found[0].length - 1;
        const body = text.slice(open, closes(text, open));
        assert.ok(
          !/(?<![\w$.])signIn\s*\(|\bsignMessage\s*\(|\bsignAndSendTransactions?\s*\(/.test(body),
          `${where(path, text, found.index)} opens the wallet`,
        );
      }
    }
  }
});

test('signIn is called from a click', () => {
  const calls = [];
  for (const path of DRAWN) {
    const text = code(path);
    for (const found of text.matchAll(/(?<![\w$.])signIn\s*\(/g)) {
      calls.push([path, text.split('\n')[lineOf(text, found.index) - 1].trim()]);
    }
  }
  assert.ok(calls.length > 0);
  for (const [path, line] of calls) {
    assert.match(line, /\bonClick=\{\(\) => void signIn\(\)\}/, `${path}: ${line}`);
  }
  // The context hands `signIn` out and does not call it.
  assert.equal([...code(CONTEXT).matchAll(/(?<![\w$.])signIn\s*\(/g)].length, 0);
});

test('a notice is closed by Got it alone: no wallet, no answer, no reply sealed for it', () => {
  const text = code(CARD);
  // Got it calls the acknowledge route and nothing that signs or seals.
  const at = text.indexOf('const gotIt = () =>');
  assert.ok(at > 0, 'the card has Got it');
  const body = text.slice(at, closes(text, text.indexOf('within(', at) + 'within'.length));
  assert.match(body, /api\.acknowledgeTask\(/);
  assert.doesNotMatch(body, /signMessage|writeReply|approveTask|rejectTask/);
  // Got it is pressed: a click calls it.
  assert.match(text, /onClick=\{\(\) => void gotIt\(\)\}/);
  // The answer block — approve, reject, what the owner supplies — is drawn for a task that is not a notice.
  assert.match(text, /\{read && open && !isNotice && \(/);
  // Sealing a reply takes an envelope that names a reply key: a notice's does not, by its type.
  assert.match(code('lib/inbox/crypto.ts'), /export async function writeReply\(envelope: AskingEnvelope,/);
});
