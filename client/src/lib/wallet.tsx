import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ethers } from 'ethers';
import type { WalletState } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { FHEVM_CONFIG } from '@shared/fhevm-config';

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepoliaNetwork: () => Promise<void>;
  encryptedAddress: string | null;
  isSepoliaNetwork: boolean;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    isConnected: false,
    chainId: null,
  });
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const { toast } = useToast();

  const encryptedAddress = walletState.address 
    ? ethers.keccak256(ethers.toUtf8Bytes(walletState.address.toLowerCase()))
    : null;

  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await browserProvider.listAccounts();
          
          if (accounts.length > 0) {
            const network = await browserProvider.getNetwork();
            const walletSigner = await browserProvider.getSigner();
            setProvider(browserProvider);
            setSigner(walletSigner);
            setWalletState({
              address: accounts[0].address,
              isConnected: true,
              chainId: Number(network.chainId),
            });
          }
        } catch (error) {
          console.error('Failed to check wallet connection:', error);
        }
      }
    };

    checkConnection();

    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletState(prev => ({ ...prev, address: accounts[0], isConnected: true }));
        } else {
          setWalletState({ address: null, isConnected: false, chainId: null });
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (typeof window.ethereum !== 'undefined') {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }
    };
  }, []);

  const switchToSepoliaNetwork = async () => {
    if (typeof window.ethereum === 'undefined') {
      toast({
        title: 'MetaMask Required',
        description: 'Please install MetaMask to switch networks.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${FHEVM_CONFIG.chainId.toString(16)}` }],
      });

      toast({
        title: 'Network Switched',
        description: 'Connected to Ethereum Sepolia',
      });
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${FHEVM_CONFIG.chainId.toString(16)}`,
                chainName: FHEVM_CONFIG.chainName,
                nativeCurrency: FHEVM_CONFIG.nativeCurrency,
                rpcUrls: [FHEVM_CONFIG.rpcUrl],
                blockExplorerUrls: [FHEVM_CONFIG.blockExplorer],
              },
            ],
          });

          toast({
            title: 'Network Added',
            description: 'Ethereum Sepolia has been added to your wallet',
          });
        } catch (addError: any) {
          toast({
            title: 'Failed to Add Network',
            description: addError.message || 'Could not add Sepolia network',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Network Switch Failed',
          description: error.message || 'Failed to switch network',
          variant: 'destructive',
        });
      }
    }
  };

  const connect = async () => {
    if (typeof window.ethereum === 'undefined') {
      toast({
        title: 'MetaMask Required',
        description: 'Please install MetaMask to connect your wallet.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const network = await browserProvider.getNetwork();
      const walletSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(walletSigner);
      setWalletState({
        address: accounts[0],
        isConnected: true,
        chainId: Number(network.chainId),
      });

      if (Number(network.chainId) !== FHEVM_CONFIG.chainId) {
        toast({
          title: 'Wrong Network',
          description: 'Please switch to Ethereum Sepolia to use FHE features',
          variant: 'destructive',
        });
        await switchToSepoliaNetwork();
      } else {
        toast({
          title: 'Wallet Connected',
          description: 'Your identity is now encrypted with FHE on Sepolia',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect wallet',
        variant: 'destructive',
      });
    }
  };

  const disconnect = () => {
    setWalletState({ address: null, isConnected: false, chainId: null });
    setProvider(null);
    setSigner(null);
    toast({
      title: 'Wallet Disconnected',
      description: 'Your session has ended',
    });
  };

  const isSepoliaNetwork = walletState.chainId === FHEVM_CONFIG.chainId;

  return (
    <WalletContext.Provider
      value={{ 
        ...walletState, 
        encryptedAddress, 
        connect, 
        disconnect, 
        switchToSepoliaNetwork,
        isSepoliaNetwork,
        provider,
        signer,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
