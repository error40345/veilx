import { ethers } from 'ethers';

export const SIGNING_DOMAIN_NAME = 'PrivacyNFTMarketplace';
export const SIGNING_DOMAIN_VERSION = '1';

export const EIP712_DOMAIN = {
  name: SIGNING_DOMAIN_NAME,
  version: SIGNING_DOMAIN_VERSION,
  chainId: 11155111, // Sepolia
};

export const SignatureTypes = {
  Mint: [
    { name: 'action', type: 'string' },
    { name: 'collectionId', type: 'string' },
    { name: 'mintPrice', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  List: [
    { name: 'action', type: 'string' },
    { name: 'nftId', type: 'string' },
    { name: 'price', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  Unlist: [
    { name: 'action', type: 'string' },
    { name: 'nftId', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  Buy: [
    { name: 'action', type: 'string' },
    { name: 'nftId', type: 'string' },
    { name: 'price', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  Offer: [
    { name: 'action', type: 'string' },
    { name: 'nftId', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  PoolDeposit: [
    { name: 'action', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
  PoolWithdraw: [
    { name: 'action', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'recipientAddress', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
};

export interface MintSignatureData {
  action: 'mint';
  collectionId: string;
  mintPrice: string;
  nonce: number;
  expiresAt: number;
}

export interface ListSignatureData {
  action: 'list';
  nftId: string;
  price: string;
  nonce: number;
  expiresAt: number;
}

export interface UnlistSignatureData {
  action: 'unlist';
  nftId: string;
  nonce: number;
  expiresAt: number;
}

export interface BuySignatureData {
  action: 'buy';
  nftId: string;
  price: string;
  nonce: number;
  expiresAt: number;
}

export interface OfferSignatureData {
  action: 'offer';
  nftId: string;
  amount: string;
  nonce: number;
  expiresAt: number;
}

export interface PoolDepositSignatureData {
  action: 'pool_deposit';
  amount: string;
  nonce: number;
  expiresAt: number;
}

export interface PoolWithdrawSignatureData {
  action: 'pool_withdraw';
  amount: string;
  recipientAddress: string;
  nonce: number;
  expiresAt: number;
}

export type SignatureData = 
  | MintSignatureData 
  | ListSignatureData 
  | UnlistSignatureData
  | BuySignatureData 
  | OfferSignatureData
  | PoolDepositSignatureData
  | PoolWithdrawSignatureData;

export interface SignedRequest<T extends SignatureData> {
  data: T;
  signature: string;
  signer: string;
}

export function getSignatureExpiryTime(minutesFromNow: number = 5): number {
  return Math.floor(Date.now() / 1000) + (minutesFromNow * 60);
}

export function isSignatureExpired(expiresAt: number): boolean {
  return Math.floor(Date.now() / 1000) > expiresAt;
}

export function getTypedDataForAction(action: string): any {
  switch (action) {
    case 'mint':
      return SignatureTypes.Mint;
    case 'list':
      return SignatureTypes.List;
    case 'unlist':
      return SignatureTypes.Unlist;
    case 'buy':
      return SignatureTypes.Buy;
    case 'offer':
      return SignatureTypes.Offer;
    case 'pool_deposit':
      return SignatureTypes.PoolDeposit;
    case 'pool_withdraw':
      return SignatureTypes.PoolWithdraw;
    default:
      throw new Error(`Unknown action type: ${action}`);
  }
}

export function getTypeName(action: string): string {
  switch (action) {
    case 'mint':
      return 'Mint';
    case 'list':
      return 'List';
    case 'unlist':
      return 'Unlist';
    case 'buy':
      return 'Buy';
    case 'offer':
      return 'Offer';
    case 'pool_deposit':
      return 'PoolDeposit';
    case 'pool_withdraw':
      return 'PoolWithdraw';
    default:
      throw new Error(`Unknown action type: ${action}`);
  }
}

export function verifySignature<T extends SignatureData>(
  signedRequest: SignedRequest<T>,
  expectedSigner: string
): boolean {
  try {
    const { data, signature, signer } = signedRequest;
    
    if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
      console.log('[Signature] Signer mismatch:', signer, 'vs', expectedSigner);
      return false;
    }
    
    if (isSignatureExpired(data.expiresAt)) {
      console.log('[Signature] Signature expired');
      return false;
    }
    
    const typeName = getTypeName(data.action);
    const types = {
      [typeName]: getTypedDataForAction(data.action),
    };
    
    const recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      types,
      data,
      signature
    );
    
    const isValid = recoveredAddress.toLowerCase() === signer.toLowerCase();
    if (!isValid) {
      console.log('[Signature] Recovered address mismatch:', recoveredAddress, 'vs', signer);
    }
    
    return isValid;
  } catch (error) {
    console.error('[Signature] Verification failed:', error);
    return false;
  }
}
