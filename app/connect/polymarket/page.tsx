'use client';

import React, { Suspense } from 'react';
import { RequireWallet } from '@/components/ui/require-wallet';
import { ConnectorOwnerPage, More, type ConnectorSpec } from '@/components/connect/ConnectorOwnerPage';
import { polymarketPolicy } from '@/lib/policies/polymarket';

/**
 * The owner's page for Polymarket. No account to connect: the venue key is a
 * sub-key of the agent's own custody wallet. What the owner stores is the
 * policy, in a row under their own account that names the agent (rules 19 and
 * 20 of the shared page). This file is only what is Polymarket's — the caps,
 * that cancelling stays open without a policy, and that it runs on mainnet
 * only.
 */
const spec: ConnectorSpec = {
  id: 'polymarket',
  provider: 'Polymarket',
  title: 'Polymarket policy',
  description: 'The caps under which an agent may take positions on Polymarket from its own wallet. Without a policy it can only read and cancel.',
  projects: {
    // Mainnet only: the page checks the project on the current network and says so on testnet.
    testnet: 'connectors.outlayer.testnet/polymarket',
    mainnet: 'connectors.outlayer.near/polymarket',
  },
  profile: 'polymarket',
  policy: polymarketPolicy,
  configured: true,
  notConfigured: '',
  intro: (
    <>
      <p>
        Nothing to connect here: the agent trades from a key of its own wallet, and Polymarket sees an ordinary account. What you store is
        the fence around it. <strong>Without a policy the agent can read markets and positions and cancel its own orders, and buy or sell
        nothing.</strong> Orders open only when both sizes are set — per order and per day.
      </p>
      <More label="What the connector can never do">
        <p>
          Reach any host but Polymarket&apos;s APIs and the bridges named in its manifest. Trade a market you excluded or past a size you
          set. Move money in or out unless the switches say so, or withdraw anywhere but the destination you allow. Show the key to
          anyone: it never leaves the enclave, the agent included.
        </p>
      </More>
      <More label="Why cancel works without a policy">
        <p>
          An agent whose policy you withdraw must still be able to take its resting orders off the book. Cancelling adds no exposure, so
          it stays on the open side; everything that can add exposure is behind the policy.
        </p>
      </More>
    </>
  ),
  connectLabel: 'Store the policy',
  reconnectLabel: '',
  reconnectWhy: null,
  grantHint: 'Nobody can trade under it until you grant an agent.',
  statusView: (output) => {
    const values: string[] = [];
    if (typeof output.deposit_wallet === 'string') values.push(`deposit wallet ${output.deposit_wallet}`);
    if (typeof output.collateral_usd === 'number') values.push(`$${output.collateral_usd} on the venue`);
    if (output.setup_done === false) values.push('setup not finished — the agent runs `setup`');
    return values.length > 0 ? { list: { heading: 'The agent’s Polymarket account:', values } } : null;
  },
};

export default function ConnectPolymarketPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectorOwnerPage spec={spec} />
      </Suspense>
    </RequireWallet>
  );
}
