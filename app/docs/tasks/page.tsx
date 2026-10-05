'use client';

import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Tasks between an agent and its owner.
 *
 * Sourced from the out-layer/outlayer repo: `docs/TASKS.md`,
 * `worker/wit/deps/tasks.wit`, `sdk/outlayer/src/tasks.rs`,
 * `wasi-examples/CONNECTOR_MANIFEST.md` (section `tasks`), `docs/CONNECTOR_TASKS.md`,
 * `connectors/tasks-probe/`, `connectors/connector-probe/` (the guessing game)
 * and the Gmail and GitHub connectors' READMEs. Where this page and those files disagree, those
 * files are the original.
 */

const REPO = 'https://github.com/out-layer/outlayer';
const TASKS_DOC = `${REPO}/blob/main/docs/TASKS.md`;
const WIT_FILE = `${REPO}/blob/main/worker/wit/deps/tasks.wit`;
const PROBE_TREE = `${REPO}/tree/main/connectors/tasks-probe`;
const MANIFEST_DOC = `${REPO}/blob/main/wasi-examples/CONNECTOR_MANIFEST.md`;
const CONNECTOR_TASKS_DOC = `${REPO}/blob/main/docs/CONNECTOR_TASKS.md`;
const PROBE_GAME = `${REPO}/tree/main/connectors/connector-probe#the-guessing-game`;

const MANIFEST = `"tasks": true`;

const CARGO = `outlayer = { version = "0.2", features = ["tasks"] }`;

const PREPARE = `use outlayer::tasks::{self, Display, FieldKind, WrittenBy};

// The request passed the owner's policy. Instead of acting, ask.
let opened = tasks::confirm(
    Display::new("Send an email")
        .list("To", &message.to, WrittenBy::Agent)
        .field("Subject", FieldKind::Text, &message.subject, WrittenBy::Agent)
        .field("Body", FieldKind::LongText, &message.body, WrittenBy::Agent),
    "confirm",                       // the operation the owner's approval runs
    &serde_json::to_vec(&message)?,  // handed back to it; never shown
    policy_json.as_bytes(),          // the policy the task is made under
)
.open()
.map_err(|e| e.refusal())?;

// The agent did its part: a success.
return Ok(tasks::awaiting_owner(&opened));`;

const ACT = `// The operation the task names: the platform runs it as the agent, on the owner's approval.
let answer = tasks::answered_for("confirm", &input, policy_json.as_bytes())
    .map_err(|e| e.refusal())?;
let message: Message = serde_json::from_slice(&answer.state)?;

check_against_the_policy_as_it_is_now(&message)?;
let sent = send(&message)?;

tasks::report(&answer.id, sent.to_string().as_bytes()).map_err(|e| e.refusal())?;`;

const DISPATCH = `// task_status, task_cancel, task_delete, tasks, tasks_unlock
if let Some(answer) = tasks::dispatch(operation, &input) {
    return answer;
}`;

const AWAITING = `{
  "success": true,
  "output": {
    "status": "awaiting_owner",
    "task_id": "0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0",
    "task_hash": "92067502a74314ee…",
    "thread": "0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0",
    "expires_at": 1790003600,
    "link": "https://app.outlayer.ai/inbox/0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0"
  }
}`;

const POLICY_CONFIRM = `{
  "actions": ["pr_get", "pr_review", "pr_merge", "commit"],
  "repos": ["alice/site"],
  "branches": ["agent/*"],
  "max_writes_per_day": 20,
  "allow_merge": true,
  "confirm": ["pr_merge", "pr_review", "commit"]
}`;

const GUESS_START = `{"operation": "guess_start", "max": 100}`;

const NOTICE = `let opened = tasks::notice(
    Display::new("The email was sent").field("To", FieldKind::Address, &to, WrittenBy::Project),
    policy_json.as_bytes(),
)
.open()
.map_err(|e| e.refusal())?;
return Ok(tasks::notified(&opened)); // {"status":"notified", "task_id", "task_hash", "thread", "expires_at", "link"}`;

const TURN = `// Ask for text instead of a yes; the answering operation is "supply".
let opened = tasks::input(display, "supply", Supplies::Text, &state, &policy)
    .open()
    .map_err(|e| e.refusal())?;`;

const STATEMENT = `Sign in to OutLayer as alice.near. Device key: p256:BFFcPW65…. Valid until 2026-10-29T12:00:00Z.`;

const APPROVAL = `Approve in OutLayer as alice.near: task 0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0 with hash 92067502a74314ee… and supply 93121736c33115cb…. At 2026-10-29T12:00:00Z.`;

const KEYS = `project key (keystore)   HMAC-SHA256(master, "task-key:v1:{project_uuid}:{owner}")
  task key               HMAC-SHA256(project key, "task:" || id)
    seal key             XChaCha20-Poly1305, bound to the task's id
    reply key pair       P-256; the public half goes out with the task
content key              32 random bytes per task; AES-256-GCM`;

function C({ children }: { children: React.ReactNode }) {
  return <code className="bg-card-muted px-1 rounded">{children}</code>;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mt-3 mb-4">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left align-top">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {rows.map((row, r) => (
            <tr key={r} className={r < rows.length - 1 ? 'border-b border-border' : undefined}>
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TasksDocsPage() {
  useHashNavigation();

  return (
    <div className="prose max-w-none">
      <h2 className="text-3xl font-bold mb-6 text-accent-text">Tasks</h2>

      <p className="text-foreground mb-6">
        An agent prepares; the owner reads and approves; the agent&apos;s run carries it out. A run of a project,
        admitted to an owner&apos;s secret row, leaves that owner a task through the <C>outlayer:tasks</C> host
        interface. The owner reads it in their{' '}
        <Link href="/inbox" className="text-accent-text underline">
          inbox
        </Link>{' '}
        with no run, and approves it with one message their wallet signs; the platform then starts a run of the
        agent that prepared it — on the agent&apos;s own payment key, within the compute limit of the run that
        prepared it — which executes the operation the task names. Any project can use it,{' '}
        <Link href="/docs/connectors" className="text-accent-text underline">
          connectors
        </Link>{' '}
        among them.
      </p>

      <div className="space-y-8">
        <section id="overview">
          <AnchorHeading id="overview">What a task is</AnchorHeading>
          <p className="text-foreground">
            <strong>An action prepared and waiting for its owner.</strong> &ldquo;Confirm this email&rdquo;,
            &ldquo;show me the bet before it is placed&rdquo;, &ldquo;give me your photo&rdquo;. The agent&apos;s
            call leaves it; the owner signs; a run of the agent, started by the platform, carries it out; the agent
            learns the outcome the next time it asks.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              <strong>Not a paused run.</strong> Nothing waits inside the enclave. A task is a record.
            </li>
            <li>
              <strong>Not a run of the owner&apos;s.</strong> The owner sends no transaction and pays nothing. The run
              that acts is the agent&apos;s, paid by the agent&apos;s key, and bounded by the run that prepared it.
            </li>
            <li>
              <strong>Not a script the owner is made to run.</strong> A task names the operation that answers
              it and carries no arguments for it. The project&apos;s code decides what happens.
            </li>
            <li>
              <strong>Not a replacement for a service&apos;s own confirmation.</strong> A bank&apos;s approval
              rules stay where they are.
            </li>
          </ul>
        </section>

        <section id="notices">
          <AnchorHeading id="notices">Notices</AnchorHeading>
          <p className="text-foreground">
            A task asks yes or no (<C>confirm</C>), or for something the owner supplies (<C>input</C>) — or nothing at all.
            A <strong>notice</strong> (<C>notice</C>) tells the owner that something happened; they read it in the same inbox
            and press <strong>Got it</strong>. It names no operation and no run follows it, so it needs no payment key: a run on
            chain may open one. It is shown, sealed and limited as a task is, and the agent reads it <C>open</C> until it is
            seen, then <C>done</C>.
          </p>
          <CodeBlock language="rust" code={NOTICE} />
        </section>

        <section id="asks-first">
          <AnchorHeading id="asks-first">Connectors that ask first</AnchorHeading>
          <p className="text-foreground">
            A connector can hold a write until its owner approves it. The owner chooses which writes, and the default is
            none: a policy that names none acts at once, as it always did.
          </p>
          <Table
            head={['Connector', 'What can wait for the owner']}
            rows={[
              ['Gmail', <C key="a">send</C>],
              [
                'GitHub',
                <>
                  every write: <C>branch_create</C>, <C>file_put</C>, <C>commit</C>, <C>issue_create</C>, <C>issue_comment</C>,{' '}
                  <C>issue_update</C>, <C>pr_create</C>, <C>pr_review</C>, <C>pr_merge</C>, <C>gist_create</C>, <C>gist_update</C>,{' '}
                  <C>repo_star</C>, <C>repo_unstar</C>
                </>,
              ],
              [
                'Mercury',
                <>
                  <C>pay_invoice</C>, <C>add_recipient</C>, <C>send_invoice</C>, <C>cancel_invoice</C> — by rule, with
                  conditions: the amount (<C>min_usd</C>, <C>max_usd</C>), the payment rail (<C>methods</C>), a saved or a new
                  payee (<C>payee</C>)
                </>,
              ],
            ]}
          />
          <p className="text-foreground">
            <strong>Turning it on.</strong> On the connector&apos;s page —{' '}
            <Link href="/connect/gmail" className="text-accent-text underline">
              Gmail
            </Link>
            ,{' '}
            <Link href="/connect/github" className="text-accent-text underline">
              GitHub
            </Link>{' '}
            — the policy editor has a group &ldquo;Ask me before&rdquo;: one box per write. What is ticked is stored in the
            policy as <C>confirm</C>:
          </p>
          <CodeBlock language="json" code={POLICY_CONFIRM} />
          <p className="text-foreground">
            <Link href="/connect/mercury" className="text-accent-text underline">
              Mercury
            </Link>{' '}
            decides per call instead: its policy&apos;s <C>rules</C> are a list of <C>{'{when, then}'}</C>, read in order, and the
            first rule whose <C>when</C> matches decides — <C>allow</C>, <C>ask</C> or <C>refuse</C>. A payment above $500,
            every wire, every cancellation can wait while a small ACH payment to a saved payee runs at once. A rule never
            widens the policy: it is asked last, of a write every other check passed.
          </p>
          <p className="text-foreground mt-3">
            A name that is not one of the connector&apos;s writes — a read, a misspelling, another case — makes the policy
            unreadable, and an unreadable policy refuses the connector&apos;s writes. Asking before a write allows nothing by
            itself: on GitHub the write must also be in <C>actions</C>.
          </p>
          <p className="text-foreground mt-3">
            <strong>What the agent gets.</strong> Its call is checked exactly as it would be before the write — every rule of
            the policy — and instead of writing, the connector leaves a task for the owner and answers:
          </p>
          <CodeBlock language="json" code={AWAITING} />
          <p className="text-foreground mt-3">
            That is a success: the agent did its part and paid the operation&apos;s price. It learns the outcome with{' '}
            <C>task_status</C> and the <C>task_id</C>: <C>done</C> with the write&apos;s result, <C>rejected</C> with the
            owner&apos;s reason if they gave one, or <C>failed</C>, <C>expired</C>, <C>void</C>.
          </p>
          <p className="text-foreground mt-3">
            <strong>What the owner sees.</strong> The task waits in the{' '}
            <Link href="/inbox" className="text-accent-text underline">
              inbox
            </Link>{' '}
            as the prepared form, in three views: <em>Preview</em> — every value the write will use, the ones the
            agent wrote marked 🤖; <em>RAW form</em> — the exact bytes the task&apos;s hash covers;{' '}
            <em>RAW request</em> — what the agent&apos;s run was called with. Beside it, <a href="#proof" className="text-accent-text underline">the proof</a>{' '}
            that a published build of the connector made the task, with the run&apos;s attestation on request. What a field
            cannot hold — a Gmail attachment, a file&apos;s content on GitHub — is handed over as a download. Approving is one
            message the owner&apos;s wallet signs, with a note for the agent if they want to give one: no transaction.
            The platform then runs the connector&apos;s <C>confirm</C> as the agent, on the agent&apos;s own payment key,
            within the compute limit of the call that prepared the task; <C>confirm</C> is priced at zero.
          </p>
          <p className="text-foreground mt-3">
            <strong>Carried out exactly as shown.</strong> <C>confirm</C> acts on the write sealed in the task and on nothing
            else: it takes no value from its own call and re-reads nothing the write was built from. It checks the policy and
            the day&apos;s count again as they are at that moment; a policy changed since the task was made makes the task{' '}
            <C>void</C>. On GitHub the owner&apos;s yes is bound to the commit they were shown: a merge is made with that head
            commit, so GitHub refuses it if the pull request moved, and an approval of any other head is refused. A confirmed
            write counts against the owner&apos;s daily number for the agent that prepared it, beside the agent&apos;s
            direct writes.
          </p>
          <p className="text-foreground mt-3">
            <strong>Saying no.</strong> <em>Reject</em> in the inbox takes an optional reason, encrypted in the page for the
            connector; nothing is written, and the agent reads the reason with <C>task_status</C> the next time it asks. A
            write refused after the owner&apos;s approval ends the task <C>failed</C>, with the reason, and the agent&apos;s
            sentence says whether the write happened, so a write that was made is not prepared twice.
          </p>
          <p className="text-foreground mt-3">
            How a connector builds this is in{' '}
            <Ext href={CONNECTOR_TASKS_DOC}>CONNECTOR_TASKS.md</Ext>.
          </p>
        </section>

        <section id="using">
          <AnchorHeading id="using">Using it in a project</AnchorHeading>
          <p className="text-foreground">Declare it in the manifest, and build on the SDK with the feature:</p>
          <CodeBlock language="json" code={MANIFEST} />
          <CodeBlock language="toml" code={CARGO} />
          <p className="text-foreground mt-3">
            Where the owner must be asked, open a task and answer the agent <C>awaiting_owner</C>:
          </p>
          <CodeBlock language="rust" code={PREPARE} />
          <CodeBlock language="json" code={AWAITING} />
          <p className="text-foreground mt-3">
            Write the operation the task names. The platform runs it as the agent on the owner&apos;s approval; it takes
            the answer, acts, and reports:
          </p>
          <CodeBlock language="rust" code={ACT} />
          <p className="text-foreground mt-3">The rest is the same in every project, and the SDK answers it:</p>
          <CodeBlock language="rust" code={DISPATCH} />
          <Table
            head={['Operation', 'Who', 'Answers']}
            rows={[
              [<C key="a">task_status</C>, 'preparer', 'where one of its tasks stands, with the result or the reason'],
              [<C key="a">tasks</C>, 'preparer', <>its tasks for this owner; <C>{'{"tasks": []}'}</C> when there are none</>],
              [<C key="a">task_cancel</C>, 'preparer', 'withdraws an open task'],
              [<C key="a">task_delete</C>, 'preparer', 'deletes a task, in any state'],
              [<C key="a">tasks_unlock</C>, 'owner', 'writes the copies of the waiting tasks for the devices now signed in'],
            ]}
          />
          <p className="text-foreground">
            Three rules a project keeps: check the request against the policy <em>before</em> the task is made;
            check it again, as of that moment, before acting; and show what will be done whole — what cannot be
            shown whole is refused, never shown in part.
          </p>
          <p className="text-foreground mt-3">
            <strong>A task is paid for when it is prepared.</strong> In a connector, the operation that opens a
            task keeps its price, and nothing comes back if the owner says no. The operation that answers a
            task, and the five above, are priced at zero: an owner pays nothing to say yes, and the run the
            platform starts for an approval is admitted only when its operation is priced zero. Its compute is
            the agent&apos;s to pay, as any call of the agent&apos;s is, up to the compute limit of the run that
            prepared the task.
          </p>
        </section>

        <section id="conversations">
          <AnchorHeading id="conversations">Conversations</AnchorHeading>
          <p className="text-foreground">
            A task may ask the owner for text or a file instead of a yes, and the run that takes the answer may ask the next
            question at once. The new task is the next <strong>turn</strong> of the same <C>thread</C>: it keeps the
            conversation&apos;s preparer, so the inbox shows it from the same agent, and it counts in that agent&apos;s share and
            under its mute.
          </p>
          <CodeBlock language="rust" code={TURN} />
          <p className="text-foreground mt-3">
            <strong>An example: a guessing game.</strong> <Ext href={PROBE_GAME}>connector-probe</Ext> plays one. The agent
            calls <C>guess_start</C>; the run picks a number from 1 to <C>max</C> and leaves the owner a task, &ldquo;Guess my
            number&rdquo;, answered <C>awaiting_owner</C>:
          </p>
          <CodeBlock language="json" code={GUESS_START} />
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The owner types a guess in the inbox and approves; the platform runs <C>guess</C> as the agent, which
              judges it.
            </li>
            <li>
              Wrong: <C>higher</C> or <C>lower</C> arrives as the next task of the same thread, showing the guess, the answer
              and the attempts so far. Right: the game ends with a notice in the thread, &ldquo;You guessed it: 57, in 6
              attempts&rdquo;, which asks nothing.
            </li>
            <li>
              The agent follows it with <C>task_status</C>: each turn&apos;s result is{' '}
              <C>{'{attempt, guess, verdict, max, detail}'}</C>, with <C>next_task_id</C> while the game goes on and{' '}
              <C>notice_task_id</C> when it is won.
            </li>
            <li>
              The number is in the task&apos;s sealed <C>state</C>, handed from turn to turn, beside random bytes: the owner
              holds the state&apos;s hash, and without them hashing every number would name it.
            </li>
          </ul>
        </section>

        <section id="who">
          <AnchorHeading id="who">Whose task, and who may do what</AnchorHeading>
          <p className="text-foreground">
            The owner of a task is the owner of the secret row the run named and the keystore opened. The
            preparer is the account that made the run. Both are the platform&apos;s facts: no function of the
            interface takes an account.
          </p>
          <Table
            head={['The run is', 'It may']}
            rows={[
              [
                <>the project&apos;s, made by an account the owner&apos;s row admits <strong>by name</strong></>,
                'open a task for that owner; read, cancel and delete its tasks: those it made and the turns of its conversations',
              ],
              [
                "the one the platform started for an approved task: the preparer's, on the preparer's key",
                'answer that task, report its result, and open the next turn of its conversation',
              ],
              [
                "the project's, made by the owner",
                'open tasks for themselves; open their waiting tasks for a new device',
              ],
              [
                'admitted by a row open to everyone, to a pattern, or to holders of a token or a role',
                <>run; <C>open</C> is refused <C>not-granted-by-name</C></>,
              ],
              ['another agent of the same owner', "nothing of the first agent's tasks"],
              ["another project's", "nothing of this project's tasks"],
              ['one that names no row, or whose row did not open', <>nothing: <C>no-owner</C></>],
              [
                'one a contract relayed: the account that called OutLayer is not the account that signed',
                <>nothing: <C>relayed</C></>,
              ],
            ]}
          />
          <p className="text-foreground">
            A task is opened over HTTPS only: the consent to carry out the owner&apos;s answer is a payment key, the
            one that pays for the run that carries it out. No key answers a task by calling: a key of the owner&apos;s
            account is not the preparer, and the preparer&apos;s own call carries no approval. The run that answers
            is started by the platform and by nothing else.
          </p>
          <p className="text-foreground mt-3">
            As with a bot in a messenger, nobody writes to a person who has not let them, and the owner
            silences whom they please: they mute an agent or a project in the inbox, and delete its waiting
            tasks at once. Who is muted, the devices signed in and the URL task events go to are on the
            inbox&apos;s settings screen, where a mute is lifted and a device withdrawn.
          </p>
        </section>

        <section id="display">
          <AnchorHeading id="display">What the owner is shown</AnchorHeading>
          <p className="text-foreground">
            A title of 80 characters and up to 12 fields. Each field is a label, one of six kinds, its values,
            and whose words they are: the project&apos;s or the agent&apos;s.
          </p>
          <Table
            head={['Kind', 'Holds', 'At most']}
            rows={[
              [<C key="a">money</C>, 'an amount with its unit', '200 characters'],
              [<C key="a">account</C>, 'an account at a service or on a chain', '200 characters'],
              [<C key="a">address</C>, 'an address: of mail, of a wallet', '200 characters'],
              [<C key="a">text</C>, 'one line', '500 characters'],
              [<C key="a">long_text</C>, 'text with line breaks', '50000 characters'],
              [<C key="a">list</C>, '1 to 20 values', '200 characters each'],
            ]}
          />
          <p className="text-foreground">
            Every value is drawn as plain text. No markup is interpreted, no link can be pressed, no image is
            loaded. Control characters, characters of zero width and characters that reorder text refuse the
            task. The host checks all of it, whatever the project was built with.
          </p>
          <p className="text-foreground mt-3">
            A task may carry <strong>files</strong> — an attachment of a message, a document — up to ten, 6 MiB
            together. The owner&apos;s page lists each by name, type and size and hands it over as a download;
            it holds the bytes it opened to the size and the hash the task names, and draws no file in itself.
            The operation that answers the task gets the files back.
          </p>
        </section>

        <section id="states">
          <AnchorHeading id="states">States</AnchorHeading>
          <Table
            head={['State', 'Means']}
            rows={[
              [<C key="a">open</C>, 'waits for the owner'],
              [<C key="a">approved</C>, <>the owner approved; the platform queued the agent&apos;s run, named in <C>run</C>, which has not taken the answer yet</>],
              [<C key="a">answering</C>, 'that run took the answer and acts'],
              [<C key="a">done</C>, 'that run ended well and the project reported; for a notice, the owner pressed Got it'],
              [
                <C key="a">failed</C>,
                <>
                  the run could not be started, did not start, refused the task, or ended any other way; <C>failure_reason</C>{' '}
                  says which: <C>preparer_key_unavailable</C>, <C>operation_priced</C>, <C>operation_unknown</C>,{' '}
                  <C>operation_limit_reached</C>, <C>wallet_unresolved</C>, <C>queue_unavailable</C>, <C>run_not_started</C>, or{' '}
                  <C>run_refused:&lt;reason&gt;</C> with the host&apos;s reason before the run took the answer; after it,{' '}
                  <C>run_failed</C> (the project said it did not carry the task out; <C>result</C> holds why, a connector&apos;s{' '}
                  refusal as <C>{'{"error": …}'}</C>), <C>run_trapped</C> (it reported the task carried out, then the run failed;{' '}
                  <C>result</C> holds the report), <C>run_unreported</C> (the run ended without a word on the task: it may{' '}
                  have acted) or <C>run_unfinished</C> (no word of its end in time)
                </>,
              ],
              [<C key="a">rejected</C>, 'the owner said no, with a reason if they gave one'],
              [<C key="a">cancelled</C>, 'the preparer withdrew it'],
              [<C key="a">expired</C>, 'past its life: 24 hours at most'],
              [<C key="a">void</C>, 'the policy changed since it was made'],
            ]}
          />
          <p className="text-foreground">
            Each move is made once, and a task never returns to <C>open</C>: a run that failed may have acted
            in part. A task that leaves <C>open</C> loses what it showed at once; its outcome is kept 30 days. A task
            approved for thirty minutes without a run taking its answer is ended <C>failed</C> by the platform. A notice is{' '}
            <C>open</C>, then <C>done</C>, <C>cancelled</C> or <C>expired</C>, and counts in every limit below as a task does.
          </p>
          <Table
            head={['Limit', 'Value']}
            rows={[
              ['open tasks addressed to one owner', '20'],
              ['of them, from one preparer, open and approved together', '10'],
              ['tasks one run opens', '5'],
              ['what the waiting tasks of one owner hold together', '64 MiB'],
              ['files of one task', '10, and 6 MiB together'],
              [<>the project&apos;s <C>state</C></>, '256 KiB'],
              ['the task, without its state and files', '256 KiB'],
            ]}
          />
        </section>

        <section id="sealed">
          <AnchorHeading id="sealed">What is sealed, and who reads it</AnchorHeading>
          <p className="text-foreground">
            The platform stores a task and opens none of it. What a task shows is kept twice: sealed under a
            key that exists only in the enclave, and under a content key encrypted to each device the owner
            signed in. A device is a convenience, never the only copy.
          </p>
          <CodeBlock language="text" code={KEYS} />
          <Table
            head={['Whoever holds', 'Can', 'Cannot']}
            rows={[
              [
                "the platform's database",
                'see who was asked by whom, of what kind and when; delete a task',
                'read what a task shows; add a device of their own; act on a task',
              ],
              ["a session's token", 'list tasks as ciphertext; reject and delete', "read a task without the device's key; approve a task"],
              ["the agent's payment key", 'prepare tasks, and pay for the run that carries an approved one out', 'approve a task, or answer one by calling'],
            ]}
          />
        </section>

        <section id="proof">
          <AnchorHeading id="proof">The proof</AnchorHeading>
          <p className="text-foreground">
            Before the inbox offers the button, it checks that the task was made by a published build of its
            project, and shows the run&apos;s attestation on request:
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>the run that made the task is attested, by an enclave whose measurements are approved on chain;</li>
            <li>it was a run of the task&apos;s project, made by the account the task names;</li>
            <li>the build that ran is a version of that project on the contract;</li>
            <li>what the run answered hashes to the hash the enclave signed for;</li>
            <li>that answer names the task with the hash of exactly what the page opened.</li>
          </ul>
          <p className="text-foreground mt-3">
            So a project&apos;s answer has to name the task it opened: <C>tasks::awaiting_owner</C> is that, put
            wherever the answer has room for it. A task written into the platform&apos;s database can be shown
            and cannot be acted on: the project acts on the task sealed in the enclave, and the owner&apos;s
            approval must name its hash. The run that carried a task out is named by <C>run</C> once there is one,
            and its attestation is public too: the page holds it to the task — a call of the agent, of the
            task&apos;s project, of the build the task names.
          </p>
        </section>

        <section id="events">
          <AnchorHeading id="events">Being told</AnchorHeading>
          <p className="text-foreground">
            The owner sees every task in the{' '}
            <Link href="/inbox" className="text-accent-text underline">
              inbox
            </Link>
            , on any device they signed in. To hear of it elsewhere they name a URL of their own on the inbox&apos;s{' '}
            <Link href="/inbox/settings" className="text-accent-text underline">
              settings
            </Link>{' '}
            — an HTTPS URL on a public host, with no credentials in it — with one signature of their wallet. The URL stays in
            force after the session that named it ends.
          </p>
          <p className="text-foreground mt-3">
            It is sent <C>task_created</C>, <C>task_approved</C> (with the <C>run</C> queued for it), <C>task_answered</C>,{' '}
            <C>task_failed</C> (with its <C>failure_reason</C>) and <C>task_expired</C>; a notice arrives as <C>task_created</C>{' '}
            with <C>&quot;kind&quot;: &quot;notice&quot;</C>, and Got it sends nothing. A body says who asked whom, of what kind and
            when, and links to the inbox. It carries nothing of what the task shows: what the owner is shown is sealed for their
            devices, and a URL is not one of them.
          </p>
          <p className="text-foreground mt-3">
            Each request carries <C>X-Wallet-Id: owner:&lt;account&gt;</C> and <C>X-Webhook-Signature</C>, the HMAC-SHA256 of
            the body in hex under a secret made when the URL was named and shown to the owner once; naming a URL again makes a
            new one. The sender follows no redirect and connects only to a public address. The agent is told nothing: it learns
            a task&apos;s outcome from <C>task_status</C> the next time it asks.
          </p>
        </section>

        <section id="session">
          <AnchorHeading id="session">The owner&apos;s session</AnchorHeading>
          <p className="text-foreground">
            The owner signs one message with their wallet (NEP-413, recipient: the OutLayer contract). It
            moves nothing and approves nothing:
          </p>
          <CodeBlock language="text" code={STATEMENT} />
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The device key is the public half of a key pair the browser made and keeps non-extractable: the
              page uses it and cannot read it.
            </li>
            <li>The session lasts until the deadline in the sentence, 30 days at most, and is not extended.</li>
            <li>
              One statement opens one session. An account has five devices in force at most, each with a
              session and a key of its own; one more retires the device signed in longest ago, which then says
              so. The owner sees their devices in the inbox&apos;s settings and withdraws any of them.
            </li>
            <li>
              Before a task is encrypted to a device, the enclave checks the statement itself: the account,
              the deadline, the signature, and that the key that signed is a full-access key of the account on
              chain. An implicit account that no transfer has made yet is signed for by its own key, the one
              it will be made with.
            </li>
            <li>
              A session lasts while the key that signed it is a full-access key of the account: a key removed
              from the account ends the session it opened.
            </li>
            <li>
              A device lost together with the wallet key that signed it in is cut off for certain by removing
              that key from the account.
            </li>
          </ul>
          <p className="text-foreground mt-3">
            Without a session nothing is told, not a count. A task made before a device signed in opens
            there after one call of the project&apos;s <C>tasks_unlock</C> by the owner.
          </p>
        </section>

        <section id="approval">
          <AnchorHeading id="approval">The approval</AnchorHeading>
          <p className="text-foreground">
            Approving a task is the same kind of signature over the task, made from the owner&apos;s click, good for
            ten minutes, once:
          </p>
          <CodeBlock language="text" code={APPROVAL} />
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              The hash is the SHA-256 of the task&apos;s bytes as the page opened them: what the owner read is what
              the enclave must hold.
            </li>
            <li>
              The supply is the SHA-256 of <C>{'{"note":<base64|null>,"supplied":<base64|null>}'}</C> over what the
              owner wrote — their answer to an <C>input</C> task, and a note for the agent beside any approval — each
              sealed by the page to the task&apos;s reply key. The owner&apos;s words are under the owner&apos;s signature,
              not merely beside it.
            </li>
            <li>
              The coordinator rebuilds the sentence from the session&apos;s account, the task&apos;s id and the request,
              verifies it, spends the nonce, moves the task to <C>approved</C> and queues the agent&apos;s run. The
              enclave rebuilds it again from the sealed task and the run&apos;s input, and takes an approval up to ten
              minutes ahead of its clock and up to thirty behind.
            </li>
            <li>
              The run is admitted as the agent&apos;s own call: the agent&apos;s payment key, wallet and identity binding as
              the preparing run had them, and no more compute than that run was allowed. A run that cannot be
              started ends the task <C>failed</C> at once, with the reason.
            </li>
          </ul>
        </section>

        <section id="refusals">
          <AnchorHeading id="refusals">Refusals</AnchorHeading>
          <p className="text-foreground">
            A project answers a refusal as <C>{'{"success": false, "error": "<code>: <sentence>"}'}</C>.
            Nothing is never a refusal, and a refusal is never an empty list.
          </p>
          <Table
            head={['Code', 'When', 'Retry']}
            rows={[
              [<C key="a">not_granted_by_name</C>, 'the row admitted the run by a rule that does not list the caller', 'no'],
              [<C key="a">no_owner</C>, 'no row named, the row did not open, or no project', 'fix the call'],
              [
                <C key="a">relayed</C>,
                'a contract made the run: the account that called OutLayer is not the account that signed',
                'call OutLayer directly',
              ],
              [<C key="a">muted</C>, 'the owner muted this agent or this project', 'no'],
              [<C key="a">inbox_full</C>, 'a limit of open tasks', 'when the owner answers some'],
              [<C key="a">task_run_limit</C>, 'this call opened or asked as much as one call may', 'in another call'],
              [<C key="a">display_invalid</C>, 'what is shown is outside the bounds; the sentence names what', 'fix the request'],
              [<C key="a">task_too_large</C>, 'the state, the task or a result is over its bound', 'make it smaller'],
              [<C key="a">task_life_too_long</C>, 'a life asked beyond 24 hours', 'ask for less'],
              [<C key="a">task_no_payment_key</C>, 'a task opened from a run on chain: a task is opened over HTTPS, with the key that pays for the run that carries it out', 'call over HTTPS'],
              [<C key="a">task_not_found</C>, 'no such task of this project, owner and preparer', 'no'],
              [<C key="a">not_the_owner</C>, "tasks_unlock in another account's call", 'no'],
              [<C key="a">not_the_preparer</C>, 'the answering operation in a run that is not the one the platform started for the task', 'no'],
              [<C key="a">task_approval_invalid</C>, "the owner's signature does not verify over this task, this hash and these words, or the task was never approved", 'no'],
              [<C key="a">task_hash_mismatch</C>, "the hash named is not the task's", 'no'],
              [<C key="a">task_answer_invalid</C>, 'another operation than the task names, or what was supplied is not what was asked', 'no'],
              [<C key="a">task_closed</C>, 'approved, answered, rejected or cancelled already', 'no'],
              [<C key="a">task_expired</C>, 'past its life', 'prepare it again'],
              [<C key="a">task_void</C>, 'the policy changed, or another build answered', 'prepare it again'],
              [<C key="a">task_unreadable</C>, 'a sealed copy that does not open', 'no'],
              [<C key="a">task_store_unavailable</C>, 'the store or the chain did not answer', 'yes, later'],
              [<C key="a">task_internal_error</C>, 'a fault of the platform that a repeat does not mend', 'no'],
            ]}
          />
        </section>

        <section id="reference">
          <AnchorHeading id="reference">Reference</AnchorHeading>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>
              <Ext href={TASKS_DOC}>TASKS.md</Ext> — the model, the inbox API, the events
            </li>
            <li>
              <Ext href={WIT_FILE}>tasks.wit</Ext> — the host interface
            </li>
            <li>
              <Ext href={PROBE_TREE}>tasks-probe</Ext> — a project that does nothing else
            </li>
            <li>
              <Ext href={MANIFEST_DOC}>CONNECTOR_MANIFEST.md</Ext> — the manifest reference, section <C>tasks</C>
            </li>
            <li>
              <Ext href={CONNECTOR_TASKS_DOC}>CONNECTOR_TASKS.md</Ext> — owner confirmation in a connector
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
