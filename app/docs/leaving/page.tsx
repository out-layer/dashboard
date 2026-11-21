import Link from 'next/link';

function AnchorHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold text-foreground mb-4 scroll-mt-4 group">
      {children}
      <a href={`#${id}`} className="ml-2 text-faint-foreground hover:text-accent-text opacity-0 group-hover:opacity-100 transition-opacity">
        #
      </a>
    </h2>
  );
}

const ROWS: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
  [
    'How the wallet is made',
    <code key="a">POST /register</code>,
    'A NEAR account registers in the keystore DAO. Its wallets come from a link an agent hands over, or from the account’s own signature.',
    <>
      A vault contract is deployed on a sub-account; wallets are registered with its <code>vault_id</code>.
    </>,
  ],
  ['Set up by', 'nobody', 'one transaction from any NEAR account', 'one transaction that creates the vault account'],
  ['Cost', 'nothing', '0.05 NEAR, once per account; 0.01 NEAR per exit', '1 NEAR kept on the vault account'],
  ['Can the keys be taken out', 'no', 'yes, by the owner account', 'yes, by the vault’s parent account'],
  ['Wait before the keys leave', '—', '24–48 hours, chosen by the owner', '1–30 days, chosen at deployment'],
  ['What leaves', '—', 'the keys of every wallet of the owner', 'the keys of the vault’s wallets and every secret bound to the vault'],
  ['Addresses afterwards', '—', 'the same addresses, signed for with keys you derive', 'the same addresses, signed for with keys you derive'],
  ['Coming back', '—', 'the same account gets new wallets, at new addresses', 'the vault is out for good'],
  [
    'Works if OutLayer stops',
    'no',
    'yes: the escrow of the keys is in the DAO contract, and the key that opens it comes from NEAR MPC',
    'yes; and a cessation declared by the DAO opens recovery on its own',
  ],
  [
    'Can it be taken away',
    '—',
    'by an upgrade of the DAO contract, which runs no earlier than the governance delay after its vote — time to leave first',
    'no: a vault’s code is fixed when it is deployed',
  ],
  ['Who can hold it back', '—', 'the exit approvers, if the owner named any', 'nobody: the parent stands above every policy'],
  ['Secrets', 'stay in OutLayer', 'stay in OutLayer', 'leave with the vault'],
];

export default function LeavingPage() {
  return (
    <div className="prose prose-lg max-w-none">
      <h1 className="text-3xl font-bold text-foreground mb-6">Leaving OutLayer with your keys</h1>

      <p className="text-foreground mb-8 text-lg">
        A wallet&rsquo;s keys are held in a TEE. Its owner can take them out and go on using the same addresses with no OutLayer service —
        and does not need a vault for that. There are two exits. Neither needs OutLayer&rsquo;s API, dashboard or consent: each is a contract
        on NEAR, the NEAR MPC network, and a tool you run yourself.
      </p>

      <section className="mb-12">
        <AnchorHeading id="compare">Three kinds of wallet, two exits</AnchorHeading>
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-card-muted">
              <tr>
                <th className="text-left px-3 py-2 font-semibold w-1/5"></th>
                <th className="text-left px-3 py-2 font-semibold">Wallet with no owner</th>
                <th className="text-left px-3 py-2 font-semibold">Owner exit</th>
                <th className="text-left px-3 py-2 font-semibold">Vault exit</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {ROWS.map(([what, none, owner, vault]) => (
                <tr key={what} className="border-t border-border">
                  <td className="px-3 py-2 font-medium align-top">{what}</td>
                  <td className="px-3 py-2 align-top">{none}</td>
                  <td className="px-3 py-2 align-top">{owner}</td>
                  <td className="px-3 py-2 align-top">{vault}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <AnchorHeading id="which">Which one</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-3">
          <li>
            <strong>A wallet that holds value has an owner.</strong> The owner exit costs one small transaction and nothing to run. An agent
            asks for it with <code>POST /wallet/v1/exit-link</code>, its user signs once on the{' '}
            <Link href="/exit" className="text-accent-text hover:underline">
              Owner exit
            </Link>{' '}
            page, and from then on the user can leave with the keys whatever happens to the agent or to OutLayer.
          </li>
          <li>
            <strong>A vault when secrets must leave too, or when no upgrade may ever touch the exit.</strong> An application whose secrets
            must be recoverable binds them to a{' '}
            <Link href="/docs/vaults" className="text-accent-text hover:underline">
              vault
            </Link>
            . A vault&rsquo;s exit is not subject to OutLayer&rsquo;s governance at all.
          </li>
          <li>
            <strong>A wallet with no owner is for a start.</strong> It has no exit: its keys stay in OutLayer. It moves to a wallet with one
            at any time — a new wallet at a new address, the funds sent over by an ordinary transfer, venue accounts opened again under it.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <AnchorHeading id="same">What is the same for both exits</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>The exit is a transaction on NEAR from the account that owns it, a wait that account chose in advance, and a claim.</li>
          <li>
            The wait is on chain for anyone to read, and lowering it takes effect only after the wait in force has passed: a stolen key
            cannot shorten the time its victim has to react.
          </li>
          <li>After the exit OutLayer no longer serves those wallets and the wallet&rsquo;s policy no longer applies.</li>
          <li>Funds held by a venue under a key of its own — a Polymarket or Hyperliquid account — are withdrawn before leaving.</li>
        </ul>
      </section>

      <section className="mb-12">
        <AnchorHeading id="runbooks">The runbooks</AnchorHeading>
        <ul className="list-disc list-inside text-foreground space-y-2">
          <li>
            Owner exit:{' '}
            <a
              href="https://github.com/out-layer/outlayer/blob/main/docs/OWNER_EXIT.md"
              className="text-accent-text hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              docs/OWNER_EXIT.md
            </a>
          </li>
          <li>
            Vault exit:{' '}
            <a
              href="https://github.com/out-layer/outlayer/blob/main/docs/LEAVING_OUTLAYER.md"
              className="text-accent-text hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              docs/LEAVING_OUTLAYER.md
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
