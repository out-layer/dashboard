'use client';

import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Tasks between an agent and its owner.
 *
 * Sourced from the out-layer/outlayer repo: `docs/TASKS.md`,
 * `worker/wit/deps/tasks.wit`, `sdk/outlayer/src/tasks.rs`,
 * `wasi-examples/CONNECTOR_MANIFEST.md` (section `tasks`) and
 * `connectors/tasks-probe/`. Where this page and those files disagree, those
 * files are the original.
 */

const REPO = 'https://github.com/out-layer/outlayer';
const TASKS_DOC = `${REPO}/blob/main/docs/TASKS.md`;
const WIT_FILE = `${REPO}/blob/main/worker/wit/deps/tasks.wit`;
const PROBE_TREE = `${REPO}/tree/main/connectors/tasks-probe`;
const MANIFEST_DOC = `${REPO}/blob/main/wasi-examples/CONNECTOR_MANIFEST.md`;

const MANIFEST = `"tasks": true`;

const CARGO = `outlayer = { version = "0.2", features = ["tasks"] }`;

const PREPARE = `use outlayer::tasks::{self, Display, FieldKind, WrittenBy};

// The request passed the owner's policy. Instead of acting, ask.
let opened = tasks::confirm(
    Display::new("Send an email")
        .list("To", &message.to, WrittenBy::Agent)
        .field("Subject", FieldKind::Text, &message.subject, WrittenBy::Agent)
        .field("Body", FieldKind::LongText, &message.body, WrittenBy::Agent),
    "confirm",                       // the operation the owner calls
    &serde_json::to_vec(&message)?,  // handed back to it; never shown
    policy_json.as_bytes(),          // the policy the task is made under
)
.open()
.map_err(|e| e.refusal())?;

// The agent did its part: a success.
return Ok(tasks::awaiting_owner(&opened));`;

const ACT = `// The operation the task names, called by the owner's wallet.
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

const STATEMENT = `Sign in to OutLayer as alice.near. Device key: p256:BFFcPW65…. Valid until 2026-10-29T12:00:00Z.`;

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
        An agent prepares; the owner reads and acts with a call of their own. A run of a project, admitted
        to an owner&apos;s secret row, leaves that owner a task through the <C>outlayer:tasks</C> host
        interface. The owner reads it in their{' '}
        <Link href="/inbox" className="text-accent-text underline">
          inbox
        </Link>{' '}
        with no run, and acts on it by calling an operation of the same project from their own wallet. Any
        project can use it,{' '}
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
            call leaves it; the owner&apos;s call carries it out; the agent learns the outcome the next time it
            asks.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-3">
            <li>
              <strong>Not a paused run.</strong> Nothing waits inside the enclave. A task is a record.
            </li>
            <li>
              <strong>Not a second run on the agent&apos;s money.</strong> Each side pays for its own call.
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
            Write the operation the task names. It takes the owner&apos;s answer, acts, and reports:
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
            task, and the five above, are priced at zero: an owner pays nothing to say yes.
          </p>
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
                'open a task for that owner; read, cancel and delete the tasks it made',
              ],
              ["the project's, made by the owner", 'answer the tasks of this project addressed to them; open them for a new device'],
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
              [<C key="a">answering</C>, <>the owner answered; the call named in <C>run</C> acts</>],
              [<C key="a">done</C>, 'that call ended well and the project reported'],
              [<C key="a">failed</C>, 'that call ended any other way. Its status is the ordinary status of a call'],
              [<C key="a">rejected</C>, 'the owner said no, with a reason if they gave one'],
              [<C key="a">cancelled</C>, 'the preparer withdrew it'],
              [<C key="a">expired</C>, 'past its life: 24 hours at most'],
              [<C key="a">void</C>, 'the policy changed since it was made'],
            ]}
          />
          <p className="text-foreground">
            Each move is made once, and a task never returns to <C>open</C>: a call that failed may have acted
            in part. A task that leaves <C>open</C> loses what it showed at once; its outcome is kept 30 days.
          </p>
          <Table
            head={['Limit', 'Value']}
            rows={[
              ['open tasks addressed to one owner', '20'],
              ['of them, from one preparer', '5'],
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
              ["a session's token", 'list tasks as ciphertext; reject and delete', "read a task without the device's key; act on a task"],
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
            answer must name its hash.
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
              chain.
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
              [<C key="a">task_not_found</C>, 'no such task of this project, owner and preparer', 'no'],
              [<C key="a">not_the_owner</C>, "an owner's operation in another account's call", 'no'],
              [<C key="a">task_hash_mismatch</C>, "the hash named is not the task's", 'no'],
              [<C key="a">task_answer_invalid</C>, 'another operation than the task names, or what was supplied is not what was asked', 'no'],
              [<C key="a">task_closed</C>, 'answered, rejected or cancelled already', 'no'],
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
          </ul>
        </section>
      </div>
    </div>
  );
}
