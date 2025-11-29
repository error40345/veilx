import { ethers } from 'ethers';
import { 
  EIP712_DOMAIN, 
  SignatureTypes,
  getSignatureExpiryTime,
  type SignatureData,
  type SignedRequest,
  type MintSignatureData,
  type ListSignatureData,
  type UnlistSignatureData,
  type BuySignatureData,
  type OfferSignatureData,
} from '@shared/signing';

let currentNonce = Math.floor(Date.now() / 1000);

export function getNextNonce(): number {
  return ++currentNonce;
}

export async function signMintRequest(
  signer: ethers.JsonRpcSigner,
  collectionId: string,
  mintPrice: string
): Promise<SignedRequest<MintSignatureData>> {
  const data: MintSignatureData = {
    action: 'mint',
    collectionId,
    mintPrice,
    nonce: getNextNonce(),
    expiresAt: getSignatureExpiryTime(5),
  };

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    { Mint: SignatureTypes.Mint },
    data
  );

  return {
    data,
    signature,
    signer: await signer.getAddress(),
  };
}

export async function signListRequest(
  signer: ethers.JsonRpcSigner,
  nftId: string,
  price: string
): Promise<SignedRequest<ListSignatureData>> {
  const data: ListSignatureData = {
    action: 'list',
    nftId,
    price,
    nonce: getNextNonce(),
    expiresAt: getSignatureExpiryTime(5),
  };

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    { List: SignatureTypes.List },
    data
  );

  return {
    data,
    signature,
    signer: await signer.getAddress(),
  };
}

export async function signUnlistRequest(
  signer: ethers.JsonRpcSigner,
  nftId: string
): Promise<SignedRequest<UnlistSignatureData>> {
  const data: UnlistSignatureData = {
    action: 'unlist',
    nftId,
    nonce: getNextNonce(),
    expiresAt: getSignatureExpiryTime(5),
  };

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    { Unlist: SignatureTypes.Unlist },
    data
  );

  return {
    data,
    signature,
    signer: await signer.getAddress(),
  };
}

export async function signBuyRequest(
  signer: ethers.JsonRpcSigner,
  nftId: string,
  price: string
): Promise<SignedRequest<BuySignatureData>> {
  const data: BuySignatureData = {
    action: 'buy',
    nftId,
    price,
    nonce: getNextNonce(),
    expiresAt: getSignatureExpiryTime(5),
  };

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    { Buy: SignatureTypes.Buy },
    data
  );

  return {
    data,
    signature,
    signer: await signer.getAddress(),
  };
}

export async function signOfferRequest(
  signer: ethers.JsonRpcSigner,
  nftId: string,
  amount: string
): Promise<SignedRequest<OfferSignatureData>> {
  const data: OfferSignatureData = {
    action: 'offer',
    nftId,
    amount,
    nonce: getNextNonce(),
    expiresAt: getSignatureExpiryTime(5),
  };

  const signature = await signer.signTypedData(
    EIP712_DOMAIN,
    { Offer: SignatureTypes.Offer },
    data
  );

  return {
    data,
    signature,
    signer: await signer.getAddress(),
  };
}
