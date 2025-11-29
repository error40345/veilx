import { useState, useCallback } from 'react';
import { useWallet } from '@/lib/wallet';
import { useFhevm } from './use-fhevm';
import {
  isContractConfigured,
  getMarketStats,
  getAllNFTs,
  mintNFT,
  approveForMarketplace,
  createListing,
  buyNFT,
  cancelListing,
  type MarketStats,
  type NFTData,
} from '@/lib/contracts';

interface UseContractsReturn {
  isConfigured: boolean;
  isLoading: boolean;
  error: Error | null;
  
  fetchStats: () => Promise<MarketStats | null>;
  fetchNFTs: () => Promise<NFTData[]>;
  
  mint: (uri: string, price: string) => Promise<number>;
  list: (tokenId: number, price: string) => Promise<number>;
  buy: (listingId: number, price: string) => Promise<number>;
  cancel: (listingId: number) => Promise<void>;
}

export function useContracts(): UseContractsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { address, isConnected } = useWallet();
  const { encryptAddr, isInitialized } = useFhevm();

  const isConfigured = isContractConfigured();

  const fetchStats = useCallback(async (): Promise<MarketStats | null> => {
    if (!isConfigured) {
      console.info('Contracts not configured. Using mock data from API.');
      return null;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      return await getMarketStats();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch stats');
      setError(error);
      console.error('Contract stats fetch failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  const fetchNFTs = useCallback(async (): Promise<NFTData[]> => {
    if (!isConfigured) return [];
    
    try {
      setIsLoading(true);
      setError(null);
      return await getAllNFTs();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch NFTs');
      setError(error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  const mint = useCallback(async (uri: string, price: string): Promise<number> => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    
    if (!isInitialized) {
      throw new Error('FHE not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const encryptedOwner = await encryptAddr(address);
      const inputProof = new Uint8Array(0);
      
      const tokenId = await mintNFT(uri, price, encryptedOwner, inputProof);
      return tokenId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to mint NFT');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, isInitialized, encryptAddr]);

  const list = useCallback(async (tokenId: number, price: string): Promise<number> => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    
    if (!isInitialized) {
      throw new Error('FHE not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await approveForMarketplace(tokenId);
      
      const encryptedSeller = await encryptAddr(address);
      const inputProof = new Uint8Array(0);
      
      const listingId = await createListing(tokenId, price, encryptedSeller, inputProof);
      return listingId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to list NFT');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, isInitialized, encryptAddr]);

  const buy = useCallback(async (listingId: number, price: string): Promise<number> => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    
    if (!isInitialized) {
      throw new Error('FHE not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const encryptedBuyer = await encryptAddr(address);
      const inputProof = new Uint8Array(0);
      
      const tradeId = await buyNFT(listingId, price, encryptedBuyer, inputProof);
      return tradeId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to buy NFT');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, isInitialized, encryptAddr]);

  const cancel = useCallback(async (listingId: number): Promise<void> => {
    if (!isConnected) {
      throw new Error('Wallet not connected');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await cancelListing(listingId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to cancel listing');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  return {
    isConfigured,
    isLoading,
    error,
    fetchStats,
    fetchNFTs,
    mint,
    list,
    buy,
    cancel,
  };
}
