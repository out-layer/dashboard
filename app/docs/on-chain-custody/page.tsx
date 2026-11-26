'use client';

import Link from 'next/link';
import { SyntaxHighlighter, vscDarkPlus } from '@/components/ui/syntax';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

const REFERENCE_DOC = 'https://github.com/out-layer/outlayer/blob/main/docs/ON_CHAIN_CUSTODY.md';
const WALLET_CONTRACT = 'https://github.com/near/intents/tree/main/contracts/wallet';

const codeStyle = { borderRadius: '0.5rem', fontSize: '0.875rem' };

function C({ children }: { children: React.ReactNode }) {
  return <code className="bg-card-muted px-1 rounded">{children}</code>;
}

function Table({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg mb-4">
      <table className="w-full text-sm">
        <thead className="bg-card-muted">
          <tr>
            {head.map((cell, i) => (
              <th key={i} className="text-left px-3 py-2 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-foreground">
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 align-top${j === 0 ? ' font-medium' : ''}`}>
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

const MODES: React.ReactNode[][] = [
  [
    'Where the balance lies',
    'the wallet’s own addresses: NEAR, NEAR Intents, EVM, Solana, a confidential balance, venue accounts',
    'the wallet contract: a NEAR account, with its NEAR and its balance inside NEAR Intents',
  ],
  ['Who signs a move', 'the enclave, within the owner’s policy', 'the agent’s key and the enclave’s key; the wallet contract verifies both'],
  ['What the agent holds', 'an API key; no private key', 'its own Ed25519 key, and the API key of its working account'],
  [
    'Cost of a move',
    'the operation’s own cost; nothing is added per operation',
    'one NEAR transaction to the wallet contract per move, with its gas, paid by the working account',
  ],
  [
    'Operations',
    'every wallet operation: transfers, calls, swaps, withdrawals, limit orders, confidential intents, signing on NEAR, EVM and Solana, connectors',
    'NEAR transfer, contract call, transfer inside NEAR Intents, swap and withdrawal to another chain through 1Click, withdrawal to NEAR',
  ],
  [
    'What the owner does at setup',
    'nothing is required; a policy and the registration for the owner’s exit are the owner’s choice',
    'registers for the owner’s exit, installs the wallet contract on an account, stores a policy',
  ],
  [
    'Leaving',
    'the owner’s exit yields the wallet’s keys',
    'the owner’s exit yields the enclave’s key of the wallet contract; the owner derives the agent’s key with their own signature and signs for both sides',
  ],
];

const HOLDERS: React.ReactNode[][] = [
  ['Agent', 'its Ed25519 key: it signs the agent’s requests to the API and the agent’s half of every move', 'move nothing'],
  ['Enclave (Intel TDX)', 'nothing at rest; it derives its key for a wallet contract when it signs', 'move nothing out of the wallet contract'],
  ['Owner account', 'the right to store the policy, approve, freeze and start an exit', 'move nothing out of the wallet contract before an exit completes'],
  ['Wallet contract', 'the agent’s main balance; the pair of public keys in its state', 'nothing: it executes a request that carries both signatures'],
  [
    'The account’s own NEAR access keys',
    'one key of the owner’s by default; none, if the owner removed them at setup',
    'everything on the account, past both signatures and past the policy',
  ],
  [
    'The agent’s OutLayer wallet (working account)',
    'a key in the enclave, as every OutLayer wallet',
    'relay a transaction and pay its gas; hold what the agent took out to work with',
  ],
];

const KINDS: React.ReactNode[][] = [
  [<C key="k">transfer</C>, <><C>to</C>, <C>amount</C></>, 'Sends NEAR from the wallet contract'],
  [
    <C key="k">call</C>,
    <><C>to</C>, <C>method</C>, <C>args_base64</C>, <C>gas</C>, <C>deposit</C></>,
    'A function call from the wallet contract, with at most 250 Tgas',
  ],
  [<C key="k">intents_transfer</C>, <><C>to</C>, <C>amount</C>, <C>token</C></>, 'A token to another account inside NEAR Intents'],
  [<C key="k">withdraw</C>, <><C>to</C>, <C>amount</C>, <C>token</C></>, 'A NEP-141 token out of NEAR Intents to a NEAR account'],
  [
    <C key="k">swap</C>,
    <><C>token_in</C>, <C>amount_in</C>, <C>token_out</C>, <C>min_out</C></>,
    'A swap through 1Click; the output arrives in the wallet contract’s balance inside NEAR Intents',
  ],
  [
    <C key="k">cross_chain_withdraw</C>,
    <><C>to</C>, <C>amount</C>, <C>token</C>, <C>chain</C></>,
    'A withdrawal to another chain through 1Click; a refund arrives in the wallet contract’s balance inside NEAR Intents',
  ],
];

const STATUSES: React.ReactNode[][] = [
  [
    <C key="s">pending_approval</C>,
    <>The policy asks for approvers; <C>approval_id</C> names the vote</>,
    'Wait, then call run again with the same id and the same operation',
  ],
  [
    <C key="s">awaiting_signature</C>,
    <>Prepared and counted; the request and the enclave’s half are present</>,
    <><C>run</C> checks the request, signs and relays; with <C>ask</C>, call <C>relay</C></>,
  ],
  [<C key="s">relayed</C>, 'The transaction was sent and its outcome is not recorded', <>Read it with <C>get(id)</C>; the read settles it</>],
  [
    <C key="s">success</C>,
    <>The request executed on chain. For a swap or a withdrawal to another chain the input reached 1Click; <C>route_status</C> on a read follows the route</>,
    '—',
  ],
  [<C key="s">failed</C>, <>The chain refused; <C>result</C> carries its failure</>, 'Read the failure; the same thing again is another operation under another id'],
  [
    <C key="s">closed</C>,
    <>Ended with nothing sent, for <C>reason</C>: the vote did not end in approval, or a prepared request was not relayed within an hour</>,
    'Read the reason; the same thing again is another operation under another id',
  ],
];

const WHERE: React.ReactNode[][] = [
  [
    'What',
    'the main balance: NEAR on the account and tokens inside NEAR Intents',
    'a confidential balance; a venue’s trading account (Hyperliquid, Polymarket); a balance kept for limit orders; NEAR for gas',
  ],
  ['Signed by', 'the agent and the enclave', 'the enclave, within the policy'],
  ['Asked for with', 'a request signed by the agent’s key', 'the wallet’s API key'],
];

const COMPROMISE: React.ReactNode[][] = [
  [
    'The enclave (memory read)',
    'The enclave’s key. No signature of the agent, so no move out of a wallet contract; and no move signed by the agent that the policy did not pass, since the agent signs last. What lies on the working account is under the enclave’s key',
  ],
  [
    'OutLayer’s governance: a hostile build, a hostile upgrade of OutLayer’s own contracts',
    'The enclave’s key, and still no move out of a wallet contract without the agent’s signature. No contract OutLayer can change is on the path of the funds in a wallet contract',
  ],
  [
    'The API in front of the enclave',
    'No move of its own and no request in the agent’s name: the enclave verifies the agent’s signature and reads the wallet contract itself. The API supplies the 1Click deposit address, the request’s nonce and the counters of what was spent; the agent checks the request before it signs',
  ],
  [
    'The agent’s machine',
    'The agent’s key. Every operation still passes the enclave’s policy; the owner freezes the wallet, sets up another agent on another account and moves the assets there',
  ],
  ['A prompt injection into the agent', 'An operation request, which the enclave judges by the policy'],
  [
    'The owner account’s key',
    'The agent’s key, by the setup’s signature. With a locked policy: what the policy allows as it stands, since a change of policy and an exit both need the approvers. Without a lock the owner’s key is the whole authority',
  ],
  [
    'An access key of the wallet contract’s account, where the owner kept one',
    'Everything on that account, at once: the key is above the contract, and neither the policy nor its lock applies',
  ],
  [
    'NEAR MPC',
    'The enclave’s key, through the master; not the agent’s, which comes from the owner’s own signature. No move out of a wallet contract',
  ],
];

export default function OnChainCustodyPage() {
  useHashNavigation();

  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-bold mb-3">On-chain Custody</h1>
      <p className="text-muted-foreground mb-8">
        An agent with on-chain custody keeps its main balance in a <strong>wallet contract</strong>: a NEAR account that runs the
        two-key variant of the{' '}
        <a href={WALLET_CONTRACT} className="text-accent-text hover:underline" target="_blank" rel="noopener noreferrer">
          NEAR Intents wallet contract
        </a>
        . The wallet contract executes a request only under two signatures: one by the agent&rsquo;s own Ed25519 key and one by a key
        held in OutLayer&rsquo;s Intel TDX enclave, which signs only an operation the owner&rsquo;s policy allows.
      </p>

      <section id="choose" className="mb-10 scroll-mt-4">
        <AnchorHeading id="choose">Two modes of custody</AnchorHeading>
        <p className="text-foreground mb-4">
          Every OutLayer wallet keeps its keys in the enclave and signs within its owner&rsquo;s policy: that is TEE custody, described
          on <Link href="/docs/agent-custody" className="text-accent-text hover:underline">Agent Custody</Link>, and it is what an agent
          gets when it registers. On-chain custody is a second place for an agent&rsquo;s funds, added to the same wallet by its owner.
          An agent with on-chain custody uses both: the wallet contract holds the main balance, and the OutLayer wallet is its{' '}
          <strong>working account</strong>.
        </p>
        <Table head={['', 'TEE custody', 'On-chain custody']} rows={MODES} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="border border-border rounded-lg p-5">
            <h4 className="font-semibold text-foreground mb-2">What on-chain custody adds</h4>
            <ul className="list-disc list-inside text-sm text-foreground space-y-1">
              <li>The chain itself requires both signatures for anything to leave the wallet contract.</li>
              <li>The policy engine cannot move those funds by itself: the enclave&rsquo;s key is one of two.</li>
              <li>The owner can leave and sign for both sides, with no OutLayer service.</li>
            </ul>
          </div>
          <div className="border border-border rounded-lg p-5">
            <h4 className="font-semibold text-foreground mb-2">What it costs</h4>
            <ul className="list-disc list-inside text-sm text-foreground space-y-1">
              <li>A NEAR transaction and its gas for every move.</li>
              <li>A signature made on the agent&rsquo;s side, with a key the agent keeps.</li>
              <li>A setup by the owner.</li>
              <li>A narrower set of operations; the rest run from the working account.</li>
            </ul>
          </div>
        </div>
        <p className="text-foreground mb-4">
          Choose on-chain custody when the owner wants that rule held by the chain for the agent&rsquo;s main balance. An agent that
          needs every operation, no key of its own and no transaction per operation uses its OutLayer wallet alone.
        </p>
        <p className="text-foreground">
          On-chain custody is for a wallet with an owner: an account registered for the{' '}
          <Link href="/docs/leaving" className="text-accent-text hover:underline">owner&rsquo;s exit</Link>. Operations inside NEAR
          Intents (<C>intents_transfer</C>, <C>withdraw</C>, <C>swap</C>, <C>cross_chain_withdraw</C>) work on mainnet only.
        </p>
      </section>

      <section id="who-holds-what" className="mb-10 scroll-mt-4">
        <AnchorHeading id="who-holds-what">Who holds what</AnchorHeading>
        <Table head={['Party', 'Holds', 'Alone it can']} rows={HOLDERS} />
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            <strong>The enclave&rsquo;s key</strong> is derived from the owner&rsquo;s master and the wallet&rsquo;s id when the
            enclave signs. Nothing per wallet is stored, and the key leaves with the owner&rsquo;s exit.
          </li>
          <li>
            <strong>The agent&rsquo;s key</strong> is derived from one signature of the owner&rsquo;s own key over a fixed message
            that names the owner account and the wallet. The owner&rsquo;s wallet makes the same signature again on request, so the
            key needs no backup. Whoever is given that signature holds the agent&rsquo;s key: it is signed on app.outlayer.ai only.
          </li>
          <li>
            <strong>The wallet contract has no extension</strong> and takes no other signer. The enclave reads the account&rsquo;s
            code hash, its pair of keys and its extensions from the chain before every signature.
          </li>
        </ul>
      </section>

      <section id="setup" className="mb-10 scroll-mt-4">
        <AnchorHeading id="setup">Set it up</AnchorHeading>
        <p className="text-foreground mb-4">
          The agent opens a setup and hands its owner a link. The owner finishes it on the{' '}
          <Link href="/wallet/custody" className="text-accent-text hover:underline">setup page</Link>, which opens from that link.
          The agent then collects its account and its key.
        </p>

        <h4 className="text-lg font-semibold mt-2 mb-2">1. The agent opens a setup</h4>
        <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={codeStyle}>
{`import { openSetup, collectSetup } from '@outlayer/sdk';

const options = { apiKey: process.env.OUTLAYER_API_KEY! }; // the wallet's API key

const setup = await openSetup(options);
// setup.url       → the link for the owner: https://app.outlayer.ai/wallet/custody?setup=…
// setup.expiresAt → the link works for 24 hours
// setup.key       → a one-time key; keep it in memory until the setup is collected`}
        </SyntaxHighlighter>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          The wallet has to have an owner. Opening a setup again ends the earlier link. Whoever holds the link can name this
          wallet&rsquo;s wallet contract until it expires; an account is taken only when its pair of keys on chain holds this
          wallet&rsquo;s enclave key.
        </p>

        <h4 className="text-lg font-semibold mt-2 mb-2">2. The owner finishes it</h4>
        <ol className="list-decimal list-inside text-foreground space-y-2 mb-4">
          <li>Connects the owner account. The page shows the owner, the agent&rsquo;s OutLayer wallet, the enclave&rsquo;s key and the network.</li>
          <li>
            Chooses the agent&rsquo;s account: a sub-account of theirs created for the agent with 0.5 NEAR for its storage (the page
            offers <C>agent.&lt;owner&gt;</C>), or the owner account itself.
          </li>
          <li>For a sub-account, chooses what happens to the account&rsquo;s own keys (below).</li>
          <li>Signs one message. The page turns the signature into the agent&rsquo;s key; the signature is not sent anywhere.</li>
          <li>
            Installs the wallet contract. The owner&rsquo;s wallet signs one plain transaction: the creation of the sub-account, or
            one key added to the owner&rsquo;s own account for this step alone. The page then points the account at the published
            build by its code hash (no code is uploaded), initialises it with the pair of keys and removes its own key.
          </li>
          <li>Hands the agent its key, sealed to the agent&rsquo;s one-time key. OutLayer carries the sealed key and cannot open it.</li>
          <li>
            Stores a policy for the wallet in <Link href="/wallet/manage" className="text-accent-text hover:underline">Wallets</Link>.
            The enclave signs for a wallet contract only under a policy its owner stored.
          </li>
        </ol>
        <p className="text-foreground mb-2">
          A NEAR account&rsquo;s own access key acts on the account directly: it moves the balance and replaces the code with no
          signature of the agent or of the enclave, and no policy applies to it. For a sub-account the owner chooses:
        </p>
        <Table
          head={['Choice', 'What it means']}
          rows={[
            [
              'Keep the owner’s key on it (the default)',
              'The owner acts on the account at any time with their own wallet. Whoever holds that key moves everything on the account at once, and no policy applies to it.',
            ],
            [
              'Remove every key from it',
              'Nothing moves without the agent’s signature and the enclave’s. The owner alone acts on it only through the owner’s exit, after its window. It cannot be undone.',
            ],
          ]}
        />
        <p className="text-sm text-muted-foreground mb-4">
          With the owner account itself as the agent&rsquo;s account, the owner&rsquo;s key stays on it. While the owner holds a key of
          the account, the setup is undone from the owner&rsquo;s own wallet: another contract deployed on the account, or the account
          deleted.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          An agent on the owner&rsquo;s own account acts as that account toward every contract its policy lets it call: what the
          account may do there, a vote in a DAO included, the agent does in its name. Calls to OutLayer&rsquo;s own contracts are
          refused, so the agent cannot store the policy it is held to.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          A key registered for an account in NEAR Intents is an access key for what the account holds there: it signs intents for
          the account with no signature of the agent or of the enclave. A sub-account the setup creates has none. An owner account
          that has used NEAR Intents has its own, as it has its NEAR key.
        </p>

        <h4 className="text-lg font-semibold mt-2 mb-2">3. The agent collects its account and its key</h4>
        <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={codeStyle}>
{`const collected = await collectSetup(options, setup.key);
if (collected === null) {
  // the owner has not finished; ask again later
} else {
  const { account, key, teePublicKey } = collected;
  // account      → the wallet contract's account: the agent's address for its main balance
  // key          → an AgentKey: it signs the agent's requests and its half of every move
  // teePublicKey → the enclave's key in the contract's pair: its half is verified against it
}`}
        </SyntaxHighlighter>
        <p className="text-sm text-muted-foreground mt-1">
          <C>collectSetup</C> opens the sealed key and refuses one whose public key is not the agent&rsquo;s key in the contract&rsquo;s
          pair. The key is the agent&rsquo;s own secret. <C>AgentKey.fromSeed(seed)</C> builds the same key from its 32-byte seed.
        </p>
      </section>

      <section id="operation" className="mb-10 scroll-mt-4">
        <AnchorHeading id="operation">Run an operation</AnchorHeading>
        <p className="text-foreground mb-4">
          The agent asks for an operation in the words every wallet uses. The enclave judges it by the owner&rsquo;s policy and, if it
          passes, builds the wallet contract&rsquo;s request and signs its half. The agent checks that the request is the operation it
          asked for, signs its half last, and the working account relays both to the wallet contract and pays the gas.
        </p>
        <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={codeStyle}>
{`import { WalletContract } from '@outlayer/sdk';

const contract = new WalletContract({ account, key, teePublicKey });

const op = { kind: 'transfer', to: 'bob.near', amount: '1000000000000000000000000' } as const;
const state = await contract.run('pay-1', op); // 'pay-1' is the agent's own id of the operation

if (state.status === 'pending_approval') {
  // The policy asks for approvers: they vote on state.approval_id.
  // An approval starts nothing. After they voted, ask again under the same id:
  await contract.run('pay-1', op);
}`}
        </SyntaxHighlighter>
        <ul className="list-disc list-inside text-foreground space-y-2 mt-4">
          <li>
            <strong>The id is the agent&rsquo;s idempotency key</strong>: 1 to 64 letters, digits, <C>-</C> and <C>_</C>. Asking again
            under the same id continues the same operation; the same id with another operation is refused.
          </li>
          <li>
            <strong>The agent signs last, and checks first.</strong> <C>run</C> signs only a request that is the operation that was asked
            for, from this wallet contract: the receiver, the method, the arguments and the amounts. It verifies the enclave&rsquo;s
            half against <C>teePublicKey</C>, and signs one request under an id. A refused or a waiting operation leaves no
            half of a move anywhere.
          </li>
          <li>
            <strong>The operation routes take no API key.</strong> Each request is signed by the agent&rsquo;s key.{' '}
            <C>ask</C>, <C>relay</C> and <C>get</C> are the steps of <C>run</C>, for an agent that drives them itself.
          </li>
          <li>
            <strong>A refusal is a <C>CustodyError</C></strong>: one of the API&rsquo;s, with its <C>code</C> and <C>status</C> (
            <C>policy_denied</C>, <C>wallet_frozen</C>, <C>wallet_busy</C>, <C>below_min_amount_out</C>, …), or one of the
            client&rsquo;s own checks, in which case nothing was signed.
          </li>
        </ul>
      </section>

      <section id="operations" className="mb-10 scroll-mt-4">
        <AnchorHeading id="operations">Operations and statuses</AnchorHeading>
        <p className="text-foreground mb-2">
          Amounts are decimal strings in the smallest unit. A token is its id inside NEAR Intents (<C>nep141:&lt;account&gt;</C>).
        </p>
        <Table head={[<C key="h">kind</C>, 'Fields', 'What it does']} rows={KINDS} />
        <p className="text-foreground mb-4">
          A <C>call</C> to a NEAR Intents contract or to the keystore DAO contract is refused. For a swap and a withdrawal to another
          chain the state carries <C>quote</C>, what 1Click quoted; the quote waits ten minutes for its input, and an input that arrives
          later is returned by 1Click to the wallet contract.
        </p>
        <Table head={[<C key="h">status</C>, 'Meaning', 'What the agent does']} rows={STATUSES} />
      </section>

      <section id="approvals" className="mb-10 scroll-mt-4">
        <AnchorHeading id="approvals">Approvals</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            The policy&rsquo;s approval rules apply to a wallet contract&rsquo;s operation as they do to the same kind of operation of
            any wallet. An operation that needs approvers is answered <C>pending_approval</C> with <C>approval_id</C>; the vote lives
            24 hours, and the agent asks again within them or the operation is closed.
          </li>
          <li>
            The policy&rsquo;s <C>webhook_url</C> receives <C>approval_needed</C> with <C>operation_id</C> (the agent&rsquo;s id),{' '}
            <C>approval_id</C>, <C>type</C> (<C>wallet_contract</C>) and <C>required</C>.
          </li>
          <li>
            <strong>An approval starts nothing.</strong> Once the approvers have voted, the agent asks again under the same id with the
            same operation. An approved operation is then prepared; a vote that ended any other way closes it with the reason.
          </li>
        </ul>
      </section>

      <section id="limits" className="mb-10 scroll-mt-4">
        <AnchorHeading id="limits">Limits and usage</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            <strong>The limits are the wallet&rsquo;s.</strong> The policy&rsquo;s limits count one set of counters for the working
            account and the wallet contract together.
          </li>
          <li>
            <strong>Usage is counted when the request is prepared</strong>, with the answer that hands out the enclave&rsquo;s half. It
            is not given back: not when the request is never relayed, and not when it fails on chain.
          </li>
          <li>
            <strong>A prepared request that is not relayed within an hour is closed.</strong> The wallet contract accepts a request for
            an hour.
          </li>
          <li>
            <strong>A freeze stops new requests, not the one already prepared.</strong> A prepared request carries the
            enclave&rsquo;s half, and the wallet contract accepts it with the agent&rsquo;s half until its hour ends. One operation
            runs at a time, so that is one request at most.
          </li>
          <li>One operation of a wallet runs at a time; a second one is refused with <C>wallet_busy</C>.</li>
          <li>The working account pays the gas of every relay and needs NEAR for it.</li>
        </ul>
      </section>

      <section id="working-account" className="mb-10 scroll-mt-4">
        <AnchorHeading id="working-account">The working account</AnchorHeading>
        <p className="text-foreground mb-4">
          Two signatures guard what lies in the wallet contract. Work that needs a key that signs by itself runs from the agent&rsquo;s
          OutLayer wallet, whose key is in the enclave like every OutLayer wallet&rsquo;s.
        </p>
        <Table head={['', 'In the wallet contract', 'On the working account']} rows={WHERE} />
        <p className="text-foreground mb-4">
          Funds reach the working account by a move out of the wallet contract, under both signatures, and return to the wallet contract
          by an ordinary operation of the working account. How much stays on the working account is the agent&rsquo;s choice.
        </p>
        <p className="text-foreground">
          <strong>Running a program as the wallet contract&rsquo;s account.</strong> A call that sets <C>use_bound_identity</C>, over
          HTTPS or in <C>request_execution</C> on chain, runs the program with <C>NEAR_SENDER_ID</C> set to the caller&rsquo;s wallet
          contract; <C>NEAR_USER_ACCOUNT_ID</C> stays the account that paid. Before the program is given the name, the enclave confirms
          that the caller&rsquo;s wallet is the wallet of that wallet contract. A call from a wallet with no wallet contract is refused
          with <C>no_bound_identity</C>. The flag changes a name: a move out of the wallet contract is still an operation under both
          signatures.
        </p>
      </section>

      <section id="leaving" className="mb-10 scroll-mt-4">
        <AnchorHeading id="leaving">Leaving</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            The <Link href="/docs/leaving" className="text-accent-text hover:underline">owner&rsquo;s exit</Link> yields the
            owner&rsquo;s master, and the enclave&rsquo;s key of every wallet contract of that owner is derived under it. The
            agent&rsquo;s key comes from the owner&rsquo;s own signature. After the exit the owner holds both keys.
          </li>
          <li>
            <C>customer-recovery wallet-contract</C> builds a request with both signatures and prints the near-cli command that sends
            it. It talks to no service and to no chain, and any NEAR account sends the call. See{' '}
            <a
              href="https://github.com/out-layer/outlayer/blob/main/scripts/customer-recovery/README.md#a-wallet-contract-after-an-exit"
              className="text-accent-text hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              scripts/customer-recovery/README.md
            </a>
            .
          </li>
          <li>
            The pair of a wallet contract is set once, when it is installed, and both keys are derived for the owner and the
            wallet: the same wallet always has the same pair. Another agent key is another agent: a new OutLayer wallet with a
            wallet contract on another account. The owner moves the assets there with their key of the old account, or through
            the exit where the keys were removed.
          </li>
          <li>An owner who keeps a key on the account acts on it at any time with that key, without an exit.</li>
        </ul>
      </section>

      <section id="compromise" className="mb-10 scroll-mt-4">
        <AnchorHeading id="compromise">What a compromise reaches</AnchorHeading>
        <Table head={['What is compromised', 'What it reaches']} rows={COMPROMISE} />
      </section>

      <section id="reference" className="mb-10 scroll-mt-4">
        <AnchorHeading id="reference">Reference</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            <a href={REFERENCE_DOC} className="text-accent-text hover:underline" target="_blank" rel="noopener noreferrer">
              docs/ON_CHAIN_CUSTODY.md
            </a>
            : every route with its request and response, the agent&rsquo;s signed request, the byte formats and their test vectors,
            the operator&rsquo;s configuration.
          </li>
          <li>
            <a href="https://api.outlayer.ai/openapi.json" className="text-accent-text hover:underline" target="_blank" rel="noopener noreferrer">
              OpenAPI specification
            </a>
            , tag &ldquo;On-chain custody&rdquo;.
          </li>
          <li>
            <a
              href="https://skills.outlayer.ai/agent-custody/references/on-chain-custody.md"
              className="text-accent-text hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              The agent&rsquo;s guide
            </a>{' '}
            in the Agent Custody skill.
          </li>
          <li>
            The owner&rsquo;s page: <Link href="/wallet/custody" className="text-accent-text hover:underline">/wallet/custody</Link>,
            opened from the link the agent gives.
          </li>
        </ul>
      </section>
    </div>
  );
}
