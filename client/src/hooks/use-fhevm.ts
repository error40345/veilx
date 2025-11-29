import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@/lib/wallet";
import {
  initializeFhevm,
  getFhevmInstance,
  encryptValue,
  encryptAddress,
  decryptValue,
  isFhevmInitialized,
} from "@/lib/fhevm";
import { FhevmInstance } from "@zama-fhe/relayer-sdk";
import { BrowserProvider } from "ethers";

interface UseFhevmReturn {
  instance: FhevmInstance | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  encrypt: (value: number | bigint, bits?: 8 | 16 | 32 | 64 | 128 | 256) => Promise<Uint8Array>;
  encryptAddr: (address: string) => Promise<Uint8Array>;
  decrypt: (contractAddress: string, ciphertext: bigint) => Promise<bigint>;
  initialize: () => Promise<void>;
}

/**
 * React hook for FHEVM operations
 * Provides encryption, decryption, and instance management
 */
export function useFhevm(): UseFhevmReturn {
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isConnected, address } = useWallet();
  
  // Track if initialization is in progress to prevent duplicate calls
  const isInitializingRef = useRef(false);

  const initialize = useCallback(async () => {
    // Prevent duplicate initialization calls
    if (isInitializingRef.current) {
      return;
    }

    isInitializingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Check if FHEVM is already initialized globally
      if (!isFhevmInitialized()) {
        await initializeFhevm();
      }
      
      // Always sync local state with global instance
      const fhevmInstance = await getFhevmInstance();
      setInstance(fhevmInstance);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to initialize FHEVM");
      setError(error);
      console.error("FHEVM initialization error:", error);
    } finally {
      setIsLoading(false);
      isInitializingRef.current = false;
    }
  }, []);

  // Auto-initialize when wallet is connected and instance is not yet set
  useEffect(() => {
    if (isConnected && !instance) {
      initialize();
    }
  }, [isConnected, instance, initialize]);

  const encrypt = useCallback(
    async (value: number | bigint, bits: 8 | 16 | 32 | 64 | 128 | 256 = 32) => {
      if (!instance) {
        throw new Error("FHEVM not initialized. Call initialize() first.");
      }
      return encryptValue(value, bits);
    },
    [instance]
  );

  const encryptAddr = useCallback(
    async (walletAddress: string) => {
      if (!instance) {
        throw new Error("FHEVM not initialized. Call initialize() first.");
      }
      return encryptAddress(walletAddress);
    },
    [instance]
  );

  const decrypt = useCallback(
    async (contractAddress: string, ciphertext: bigint) => {
      if (!instance) {
        throw new Error("FHEVM not initialized. Call initialize() first.");
      }
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      return decryptValue(contractAddress, ciphertext, address, signer);
    },
    [instance, isConnected, address]
  );

  return {
    instance,
    isInitialized: isFhevmInitialized(),
    isLoading,
    error,
    encrypt,
    encryptAddr,
    decrypt,
    initialize,
  };
}
