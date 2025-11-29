import { ethers, Wallet, JsonRpcProvider } from 'ethers';

let fhevmInstance: any = null;
let initPromise: Promise<any> | null = null;

export function resetFhevmInstance(): void {
  fhevmInstance = null;
  initPromise = null;
  console.log('[FHEVM Server] Instance reset - will reinitialize on next use');
}

function getNetworkUrl(): string {
  const infuraKey = process.env.INFURA_API_KEY;
  if (!infuraKey) {
    throw new Error('INFURA_API_KEY not configured');
  }
  return `https://sepolia.infura.io/v3/${infuraKey}`;
}

function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(getNetworkUrl());
}

function getRelayerWallet(): Wallet {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error('MNEMONIC not configured for relayer wallet');
  }
  
  const wallet = Wallet.fromPhrase(mnemonic);
  return wallet.connect(getProvider());
}

async function initializeFhevm(): Promise<any> {
  if (fhevmInstance) {
    return fhevmInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const relayerSdk = await import('@zama-fhe/relayer-sdk/node');
      
      const wallet = getRelayerWallet();
      console.log('[FHEVM Server] Initializing with relayer wallet');
      console.log('[FHEVM Server] Using SepoliaConfig from SDK v0.3.0-5');
      
      const { SepoliaConfig } = relayerSdk;
      
      const instance = await relayerSdk.createInstance({
        ...SepoliaConfig,
        network: getNetworkUrl(),
      });
      
      console.log('[FHEVM Server] Instance created successfully with SepoliaConfig');
      fhevmInstance = instance;
      return instance;
    } catch (error) {
      console.error('[FHEVM Server] Initialization failed:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

export interface ServerEncryptedInput {
  handle: string;
  proof: string;
}

export async function createServerEncryptedAddressInput(
  contractAddress: string,
  buyerAddress: string
): Promise<ServerEncryptedInput> {
  const wallet = getRelayerWallet();
  const instance = await initializeFhevm();
  
  console.log(`[FHEVM Server] Creating encrypted input for contract...`);
  
  // Create encrypted input using the instance method
  // The userAddress should be the one who will submit the transaction (relayer)
  const inputHandle = instance.createEncryptedInput(contractAddress, wallet.address);
  
  // The VeilXCollection contract expects externalEuint64, so we need to use add64()
  // Convert address to a 64-bit representation (use lower 64 bits of address)
  // Address is 160 bits (20 bytes), we take the lower 8 bytes (64 bits)
  const addressHex = buyerAddress.toLowerCase().replace('0x', '');
  const lower64bits = addressHex.slice(-16); // Last 16 hex chars = 8 bytes = 64 bits
  const addressAs64bit = BigInt('0x' + lower64bits);
  
  console.log(`[FHEVM Server] Converting address to euint64...`);
  
  // Add as 64-bit encrypted value (matching contract's externalEuint64 type)
  inputHandle.add64(addressAs64bit);
  
  console.log(`[FHEVM Server] Encrypting as euint64...`);
  
  // Encrypt the input
  const result = await inputHandle.encrypt();
  
  console.log('[FHEVM Server] Encryption successful');
  
  const toHexString = (bytes: Uint8Array | any): string => {
    if (bytes instanceof Uint8Array) {
      return '0x' + Array.from(bytes)
        .map((byte: number) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    if (typeof bytes === 'string') {
      return bytes.startsWith('0x') ? bytes : '0x' + bytes;
    }
    return String(bytes);
  };
  
  if (result && typeof result === 'object') {
    if (result.handles && Array.isArray(result.handles) && result.handles.length > 0) {
      return {
        handle: toHexString(result.handles[0]),
        proof: toHexString(result.inputProof),
      };
    }
  }
  
  throw new Error('Unexpected encryption result format: ' + JSON.stringify(result));
}

export function isServerFhevmConfigured(): boolean {
  return !!(process.env.MNEMONIC && process.env.INFURA_API_KEY);
}
