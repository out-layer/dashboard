'use client';

import React, { Suspense } from 'react';
import { RequireWallet } from '@/components/ui/require-wallet';
import { ConnectorOwnerPage, More, type ConnectorSpec } from '@/components/connect/ConnectorOwnerPage';
import { hyperliquidPolicy } from '@/lib/policies/hyperliquid';

/**
 * The owner's page for Hyperliquid. There is no account to connect: the venue
 * key is a sub-key of the agent's own custody wallet, derived and held in the
 * enclave. What the owner stores is the policy, in a row under their own
 * account that names the agent (rules 19 and 20 of the shared page). This file
 * is only what is Hyperliquid's — the caps, why leverage is one of the three
 * that turn orders on, and the testnet flag stored beside the policy.
 */
const spec: ConnectorSpec = {
  id: 'hyperliquid',
  provider: 'Hyperliquid',
  title: 'Hyperliquid policy',
  description: 'The caps under which an agent may trade perpetuals from its own wallet. Without a policy the connector is read-only.',
  projects: {
    testnet: 'connectors.outlayer.testnet/hyperliquid',
    mainnet: 'connectors.outlayer.near/hyperliquid',
  },
  profile: 'hyperliquid',
  policy: hyperliquidPolicy,
  // The connector routes to Hyperliquid's testnet when this sits next to the policy.
  extraKeys: { testnet: { HYPERLIQUID_TESTNET: '1' } },
  configured: true,
  notConfigured: '',
  intro: (
    <>
      <p>
        Nothing to connect here: the agent trades from a key of its own wallet, and Hyperliquid sees an ordinary account. What you store
        is the fence around it. <strong>Without a policy the agent can read markets and positions, and place nothing.</strong> Orders
        open only when all three sizes are set — per order, per day, and the leverage cap.
      </p>
      <More label="Why leverage is required even if the agent never changes it">
        <p>
          A fresh Hyperliquid account trades at the market&apos;s maximum leverage until something sets it. A policy that caps the order
          but not the leverage would let a $100 order carry a $5,000 position, so the connector refuses to place anything until you have
          named the ceiling.
        </p>
      </More>
      <More label="What the connector can never do">
        <p>
          Reach any host but Hyperliquid&apos;s API and the 1Click bridge named in its manifest. Trade a coin you excluded, past a size you
          set, or at leverage above your cap. Move money in or out unless the switches say so. Show the key to anyone: it never leaves the
          enclave, the agent included. Under all of it sits the wallet&apos;s own EVM-signing capability, which the keystore refuses when
          it is off.
        </p>
      </More>
    </>
  ),
  connectLabel: 'Store the policy',
  reconnectLabel: '',
  reconnectWhy: null,
  grantHint: 'Nobody can trade under it until you grant an agent.',
  statusView: (output) => {
    const addresses = output.addresses as { trading?: string } | undefined;
    const perp = output.perp as { account_value_usd?: unknown; positions?: number } | undefined;
    const values: string[] = [];
    if (addresses?.trading) values.push(`trading address ${addresses.trading}`);
    if (perp && perp.account_value_usd !== undefined && perp.account_value_usd !== null) values.push(`account value $${String(perp.account_value_usd)}`);
    if (perp && typeof perp.positions === 'number') values.push(`${perp.positions} open position${perp.positions === 1 ? '' : 's'}`);
    return values.length > 0 ? { list: { heading: 'The agent’s Hyperliquid account:', values } } : null;
  },
};

export default function ConnectHyperliquidPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectorOwnerPage spec={spec} />
      </Suspense>
    </RequireWallet>
  );
}
