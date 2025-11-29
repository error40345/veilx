/**
 * FHEVM SDK Integration for VeilX
 * Uses CDN-based SDK (v0.3.0-5) for FHEVM v0.9 on Sepolia
 * Based on working fhevm-react-template implementation
 */

import { JsonRpcSigner } from "ethers";

declare global {
  interface Window {
    RelayerSDK: any;
    relayerSDK: any;
    ethereum: any;
  }
}

let fhevmInstance: any = null;
let initPromise: Promise<any> | null = null;
let sdkInitialized = false;

export async function initializeFhevm(): Promise<void> {
  console.log("FHEVM initialization starting for Sepolia (v0.9)...");
  await getFhevmInstance();
  console.log("FHEVM initialized successfully");
}

async function initSDKFromCDN(): Promise<void> {
  if (sdkInitialized) return;

  const sdk = window.RelayerSDK || window.relayerSDK;
  if (!sdk) {
    throw new Error(
      'RelayerSDK not loaded. Please include the script tag in your HTML:\n' +
      '<script src="https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.umd.cjs"></script>'
    );
  }

  if (sdk.initSDK) {
    await sdk.initSDK();
    console.log('✅ FHEVM SDK initialized with CDN');
  }
  
  sdkInitialized = true;
}

export async function getFhevmInstance(): Promise<any> {
  if (fhevmInstance) {
    return fhevmInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('Ethereum provider not found. Please install MetaMask or connect a wallet.');
    }

    await initSDKFromCDN();

    const sdk = window.RelayerSDK || window.relayerSDK;
    const { createInstance, SepoliaConfig } = sdk;

    console.log('📋 SDK SepoliaConfig:', SepoliaConfig);

    const config = { 
      ...SepoliaConfig,
      chainId: 11155111,
      gatewayUrl: "https://gateway.sepolia.zama.ai/",
      network: window.ethereum 
    };

    console.log('📋 Final FHEVM config:', config);

    try {
      fhevmInstance = await createInstance(config);
      console.log('✅ FHEVM instance created successfully for Sepolia');
      return fhevmInstance;
    } catch (err) {
      console.error('FHEVM instance creation failed:', err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export interface EncryptedInput {
  handle: Uint8Array;
  proof: Uint8Array;
}

export async function createEncryptedInput(
  contractAddress: string,
  userAddress: string,
  value: number | bigint,
  bits: 8 | 16 | 32 | 64 = 64
): Promise<EncryptedInput> {
  const fhe = await getFhevmInstance();
  
  console.log(`🔐 Creating encrypted input for contract ${contractAddress}, user ${userAddress}, value ${value}`);

  const inputHandle = fhe.createEncryptedInput(contractAddress, userAddress);
  
  switch (bits) {
    case 8:
      inputHandle.add8(Number(value));
      break;
    case 16:
      inputHandle.add16(Number(value));
      break;
    case 32:
      inputHandle.add32(Number(value));
      break;
    case 64:
      inputHandle.add64(BigInt(value));
      break;
  }
  
  const result = await inputHandle.encrypt();
  console.log('✅ Encrypted input created successfully');
  console.log('📦 Encryption result structure:', {
    hasHandles: !!(result?.handles),
    handlesLength: result?.handles?.length,
    hasInputProof: !!(result?.inputProof),
    inputProofLength: result?.inputProof?.length,
    resultKeys: result ? Object.keys(result) : []
  });
  
  if (result && typeof result === 'object') {
    if (result.handles && Array.isArray(result.handles) && result.handles.length > 0) {
      const handle = result.handles[0];
      const proof = result.inputProof;
      
      console.log('🔑 Handle type:', typeof handle, 'isUint8Array:', handle instanceof Uint8Array);
      console.log('🔑 Handle value:', handle);
      console.log('📜 Proof type:', typeof proof, 'isUint8Array:', proof instanceof Uint8Array);
      console.log('📜 Proof length:', proof?.length);
      
      return {
        handle: handle,
        proof: proof,
      };
    } else if (result.encryptedData && result.proof) {
      return {
        handle: result.encryptedData,
        proof: result.proof,
      };
    }
  }
  
  console.warn('⚠️ Unexpected encryption result format:', result);
  return {
    handle: result,
    proof: result,
  };
}

export async function createEncryptedAddressInput(
  contractAddress: string,
  userAddress: string
): Promise<EncryptedInput> {
  const fhe = await getFhevmInstance();
  
  const inputHandle = fhe.createEncryptedInput(contractAddress, userAddress);
  
  // The contract expects euint64, not eaddress
  // Convert the address to a uint64 by taking the first 8 bytes of its keccak256 hash
  const { ethers } = await import('ethers');
  const addressHash = ethers.keccak256(ethers.toUtf8Bytes(userAddress));
  // Take first 16 hex chars after 0x = 8 bytes = 64 bits
  const uint64Value = BigInt('0x' + addressHash.slice(2, 18));
  
  console.log(`🔐 Creating encrypted uint64 for address ${userAddress}: ${uint64Value.toString()}`);
  
  inputHandle.add64(uint64Value);
  
  const result = await inputHandle.encrypt();
  
  if (result && typeof result === 'object') {
    if (result.handles && Array.isArray(result.handles) && result.handles.length > 0) {
      return {
        handle: result.handles[0],
        proof: result.inputProof,
      };
    }
  }
  
  return {
    handle: result,
    proof: result,
  };
}

export async function createEncryptedAddressInputForRelayer(
  contractAddress: string,
  relayerAddress: string,
  ownerAddress: string
): Promise<EncryptedInput> {
  const fhe = await getFhevmInstance();
  
  console.log(`🔐 Creating encrypted input for relayer: contract=${contractAddress}, relayer=${relayerAddress}, owner=${ownerAddress}`);
  
  const inputHandle = fhe.createEncryptedInput(contractAddress, relayerAddress);
  
  // The contract expects euint64, not eaddress
  // Convert the address to a uint64 by taking the first 8 bytes of its keccak256 hash
  const { ethers } = await import('ethers');
  const addressHash = ethers.keccak256(ethers.toUtf8Bytes(ownerAddress));
  // Take first 16 hex chars after 0x = 8 bytes = 64 bits
  const uint64Value = BigInt('0x' + addressHash.slice(2, 18));
  
  console.log(`🔐 Creating encrypted uint64 for owner ${ownerAddress}: ${uint64Value.toString()}`);
  
  inputHandle.add64(uint64Value);
  
  const result = await inputHandle.encrypt();
  
  console.log('✅ Encrypted input for relayer created');
  
  if (result && typeof result === 'object') {
    if (result.handles && Array.isArray(result.handles) && result.handles.length > 0) {
      return {
        handle: result.handles[0],
        proof: result.inputProof,
      };
    }
  }
  
  return {
    handle: result,
    proof: result,
  };
}

export async function encryptValue(
  value: number | bigint,
  bits: 8 | 16 | 32 | 64 | 128 | 256 = 32
): Promise<Uint8Array> {
  const fhe = await getFhevmInstance();
  
  switch (bits) {
    case 8:
      return fhe.encrypt8(Number(value));
    case 16:
      return fhe.encrypt16(Number(value));
    case 32:
      return fhe.encrypt32(Number(value));
    case 64:
      return fhe.encrypt64(BigInt(value));
    case 128:
      return fhe.encrypt128(BigInt(value));
    case 256:
      return fhe.encrypt256(BigInt(value));
    default:
      throw new Error(`Unsupported bit size: ${bits}`);
  }
}

export async function encryptAddress(address: string): Promise<Uint8Array> {
  const fhe = await getFhevmInstance();
  return fhe.encryptAddress(address);
}

export async function generatePublicKey(
  contractAddress: string,
  userAddress: string,
  signer: JsonRpcSigner
): Promise<string> {
  const fhe = await getFhevmInstance();
  
  const { publicKey } = fhe.generatePublicKey({
    verifyingContract: contractAddress,
  });

  const eip712 = fhe.createEIP712(publicKey, contractAddress);
  const signedKey = await signer.signTypedData(
    eip712.domain,
    { Reencrypt: eip712.types.Reencrypt },
    eip712.message
  );

  return signedKey;
}

export async function decryptValue(
  contractAddress: string,
  ciphertext: bigint,
  userAddress: string,
  signer: JsonRpcSigner
): Promise<bigint> {
  const fhe = await getFhevmInstance();

  try {
    const keypair = fhe.generateKeypair();
    const handleContractPairs = [
      {
        handle: ciphertext.toString(),
        contractAddress: contractAddress,
      },
    ];

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";
    const contractAddresses = [contractAddress];

    const eip712 = fhe.createEIP712(
      keypair.publicKey,
      contractAddresses,
      startTimeStamp,
      durationDays
    );

    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message
    );

    const result = await fhe.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace("0x", ""),
      contractAddresses,
      await signer.getAddress(),
      startTimeStamp,
      durationDays
    );

    return BigInt(result[ciphertext.toString()]);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw error;
  }
}

export async function publicDecrypt(encryptedHandle: string): Promise<number> {
  const fhe = await getFhevmInstance();
  
  try {
    console.log('🔓 Calling publicDecrypt with handle:', encryptedHandle);
    const result = await fhe.publicDecrypt([encryptedHandle]);
    console.log('🔓 publicDecrypt returned:', result);

    let decryptedValue;

    if (result && typeof result === 'object') {
      if (result.clearValues && typeof result.clearValues === 'object') {
        decryptedValue = result.clearValues[encryptedHandle];
      } else if (Array.isArray(result)) {
        decryptedValue = result[0];
      } else {
        decryptedValue = result[encryptedHandle] || Object.values(result)[0];
      }
    } else {
      decryptedValue = result;
    }

    const numberValue = typeof decryptedValue === 'bigint' 
      ? Number(decryptedValue) 
      : Number(decryptedValue);

    if (isNaN(numberValue)) {
      throw new Error(`Decryption returned invalid value: ${decryptedValue}`);
    }

    return numberValue;
  } catch (error: any) {
    console.error('❌ Decryption error:', error);
    if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
      throw new Error('Decryption service is temporarily unavailable. Please try again later.');
    }
    throw error;
  }
}

export async function getReencryptionSignature(
  userAddress: string,
  contractAddress: string,
  signer: JsonRpcSigner
): Promise<string> {
  const fhe = await getFhevmInstance();
  
  const eip712 = fhe.createEIP712(
    fhe.getPublicKey(contractAddress) || "",
    contractAddress
  );

  const signature = await signer.signTypedData(
    eip712.domain,
    { Reencrypt: eip712.types.Reencrypt },
    eip712.message
  );

  return signature;
}

export function resetFhevmInstance(): void {
  fhevmInstance = null;
  initPromise = null;
  sdkInitialized = false;
}

export function isFhevmInitialized(): boolean {
  return fhevmInstance !== null;
}
