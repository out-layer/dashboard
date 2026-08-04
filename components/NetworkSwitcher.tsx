'use client';

import { useNearWallet } from '@/contexts/NearWalletContext';
import { useState } from 'react';
import type { NetworkType } from '@/contexts/NearWalletContext';

// Network switcher component for Settings page - shows current network and allows switching
export default function NetworkSwitcher() {
  const { isConnected, network, switchNetwork, disconnect } = useNearWallet();
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<NetworkType | null>(null);

  const handleNetworkSwitch = (newNetwork: NetworkType) => {
    // Do nothing if clicking on current network
    if (newNetwork === network) {
      return;
    }

    if (isConnected) {
      // Show confirmation modal if connected
      setPendingNetwork(newNetwork);
      setShowNetworkModal(true);
    } else {
      // Switch directly if not connected
      switchNetwork(newNetwork);
    }
  };

  const confirmNetworkSwitch = async () => {
    if (pendingNetwork) {
      // Disconnect first to avoid "no wallet selected" error
      await disconnect();
      // Then switch network - wallet selector will reinitialize via useEffect
      switchNetwork(pendingNetwork);
      setShowNetworkModal(false);
      setPendingNetwork(null);
    }
  };

  const cancelNetworkSwitch = () => {
    setShowNetworkModal(false);
    setPendingNetwork(null);
  };

  return (
 <div className="flex items-center">
      {/* Network Switcher */}
 <div className="flex items-center bg-card-muted rounded-lg p-1">
        <button
          onClick={() => handleNetworkSwitch('testnet')}
          disabled={!isConnected}
 className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            network === 'testnet'
              ? 'bg-card text-accent-text shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          Testnet
        </button>
        <button
          onClick={() => handleNetworkSwitch('mainnet')}
          disabled={!isConnected}
 className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            network === 'mainnet'
              ? 'bg-card text-[#5a8f3a] shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          Mainnet
        </button>
      </div>

      {/* Network Switch Confirmation Modal */}
      {showNetworkModal && (
 <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
 <div className="bg-card rounded-lg border border-border-xl max-w-md w-full p-6">
 <h3 className="text-lg font-semibold text-foreground mb-3">
              Switch Network?
            </h3>
 <p className="text-muted-foreground mb-6">
              You will be disconnected from your current wallet and need to reconnect on <span className="font-semibold">{pendingNetwork}</span>.
            </p>
 <div className="flex space-x-3">
              <button
                onClick={confirmNetworkSwitch}
 className="flex-1 px-4 py-2 bg-accent text-on-accent rounded-lg font-medium transition-colors"
              >
                Switch Network
              </button>
              <button
                onClick={cancelNetworkSwitch}
 className="flex-1 px-4 py-2 bg-card-muted text-foreground rounded-lg font-medium hover:bg-card-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
