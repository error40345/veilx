import { ethers, Wallet, JsonRpcProvider, Contract } from 'ethers';

const NFT_ABI = [
  "function mint(string uri, uint256 mintPrice, bytes32 encryptedOwner, bytes inputProof) returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event Minted(uint256 indexed tokenId, address indexed minter, string uri, uint256 mintPrice)",
];

const COLLECTION_ABI = [
  "function mint(string tokenUri, bytes32 encryptedOwnerInput, bytes calldata inputProof) payable returns (uint256)",
  "function listNFT(uint256 tokenId, uint256 price, bytes32 encryptedSellerInput, bytes calldata inputProof)",
  "function unlistNFT(uint256 tokenId)",
  "function buyNFT(uint256 tokenId, bytes32 encryptedBuyerInput, bytes calldata inputProof) payable",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isListed(uint256 tokenId) view returns (bool)",
  "function listingPrices(uint256 tokenId) view returns (uint256)",
  "function makeOffer(uint256 tokenId, bytes32 encryptedOffererInput, bytes calldata inputProof) payable returns (uint256)",
  "function cancelOffer(uint256 offerId)",
  "function acceptOffer(uint256 offerId, bytes32 encryptedNewOwnerInput, bytes calldata inputProof)",
  "function getOffer(uint256 offerId) view returns (address offerer, uint256 amount, bool isActive, uint256 createdAt)",
  "function getTokenOffers(uint256 tokenId) view returns (uint256[])",
  "event NFTMinted(uint256 indexed tokenId, uint256 mintPrice, uint256 timestamp)",
  "event NFTListed(uint256 indexed tokenId, uint256 price, uint256 timestamp)",
  "event NFTUnlisted(uint256 indexed tokenId, uint256 timestamp)",
  "event NFTSold(uint256 indexed tokenId, uint256 price, uint256 timestamp)",
  "event OfferCreated(uint256 indexed offerId, uint256 indexed tokenId, uint256 amount, uint256 timestamp)",
  "event OfferCanceled(uint256 indexed offerId, uint256 indexed tokenId, uint256 timestamp)",
  "event OfferAccepted(uint256 indexed offerId, uint256 indexed tokenId, uint256 amount, uint256 timestamp)",
];

const PRIVACY_POOL_ABI = [
  "function deposit(bytes32 accountHash) payable",
  "function withdraw(bytes32 accountHash, uint256 amount, address recipient)",
  "function deductForMint(bytes32 accountHash, uint256 amount) returns (bool)",
  "function getBalance(bytes32 accountHash) view returns (uint256)",
  "function hasSufficientBalance(bytes32 accountHash, uint256 amount) view returns (bool)",
  "function getPoolStats() view returns (uint256 totalBalance, uint256 totalDeposits, uint256 totalWithdrawals)",
  "event Deposited(bytes32 indexed depositId, uint256 amount, uint256 timestamp)",
  "event Withdrawn(bytes32 indexed withdrawalId, uint256 amount, uint256 timestamp)",
  "event RelayerPayment(uint256 amount, uint256 timestamp)",
];

let relayerWallet: Wallet | null = null;
let provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!provider) {
    const infuraKey = process.env.INFURA_API_KEY;
    if (!infuraKey) {
      throw new Error('INFURA_API_KEY not configured');
    }
    provider = new JsonRpcProvider(`https://sepolia.infura.io/v3/${infuraKey}`);
  }
  return provider;
}

function getRelayerWallet(): Wallet {
  if (!relayerWallet) {
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
      throw new Error('MNEMONIC not configured for relayer wallet');
    }
    
    const wallet = Wallet.fromPhrase(mnemonic);
    relayerWallet = wallet.connect(getProvider());
    console.log(`Relayer wallet initialized`);
  }
  return relayerWallet;
}

export async function getRelayerAddress(): Promise<string> {
  const wallet = getRelayerWallet();
  return wallet.address;
}

export async function getRelayerBalance(): Promise<string> {
  const wallet = getRelayerWallet();
  const balance = await getProvider().getBalance(wallet.address);
  return ethers.formatEther(balance);
}

export interface PrivateMintRequest {
  uri: string;
  mintPrice: string;
  encryptedOwner: string;
  inputProof: string;
  contractAddress?: string;
}

export interface PrivateMintResult {
  success: boolean;
  tokenId?: number;
  txHash?: string;
  error?: string;
}

export async function privateMintNFT(request: PrivateMintRequest): Promise<PrivateMintResult> {
  try {
    const wallet = getRelayerWallet();
    const contractAddress = request.contractAddress || process.env.VITE_NFT_CONTRACT_ADDRESS;
    
    if (!contractAddress) {
      throw new Error('NFT contract address not configured');
    }

    const balance = await wallet.provider?.getBalance(wallet.address);
    console.log(`[Relayer] Wallet balance: ${ethers.formatEther(balance || 0n)} ETH`);

    const nftContract = new Contract(contractAddress, NFT_ABI, wallet);
    
    const priceWei = ethers.parseEther(request.mintPrice);
    
    console.log(`[Relayer] Submitting private mint transaction...`);
    console.log(`[Relayer] Contract: ${contractAddress}`);
    console.log(`[Relayer] URI length: ${request.uri.length}`);
    console.log(`[Relayer] Price: ${request.mintPrice} ETH (${priceWei} wei)`);
    console.log(`[Relayer] Encrypted owner (handle): ${request.encryptedOwner.substring(0, 20)}...`);
    console.log(`[Relayer] Input proof length: ${request.inputProof.length} chars`);
    
    const tx = await nftContract.mint(
      request.uri,
      priceWei,
      request.encryptedOwner,
      request.inputProof
    );
    
    console.log(`[Relayer] Transaction submitted: ${tx.hash}`);
    console.log(`[Relayer] Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer] Transaction confirmed in block ${receipt.blockNumber}`);
    
    const mintedEvent = receipt.logs.find(
      (log: any) => log.fragment?.name === 'Minted'
    );
    
    let tokenId: number | undefined;
    if (mintedEvent) {
      tokenId = Number(mintedEvent.args[0]);
      console.log(`[Relayer] Minted token ID: ${tokenId}`);
    } else {
      console.log(`[Relayer] No Minted event found in logs`);
      const supply = await nftContract.totalSupply();
      tokenId = Number(supply) - 1;
      console.log(`[Relayer] Inferred token ID from supply: ${tokenId}`);
    }
    
    return {
      success: true,
      tokenId,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer] Mint failed:', error);
    const errorMessage = error.reason || error.message || 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export interface PrivateCollectionMintRequest {
  collectionAddress: string;
  tokenUri: string;
  mintPrice: string;
  encryptedOwner: string;
  inputProof: string;
}

export async function privateMintFromCollection(request: PrivateCollectionMintRequest): Promise<PrivateMintResult> {
  try {
    const wallet = getRelayerWallet();
    
    const collectionContract = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    const priceWei = ethers.parseEther(request.mintPrice);
    
    console.log(`[Relayer] Submitting private collection mint...`);
    console.log(`[Relayer] Collection: ${request.collectionAddress}`);
    console.log(`[Relayer] Token URI: ${request.tokenUri}`);
    console.log(`[Relayer] Price: ${request.mintPrice} ETH`);
    
    const tx = await collectionContract.mint(
      request.tokenUri,
      request.encryptedOwner,
      request.inputProof,
      { value: priceWei }
    );
    
    console.log(`[Relayer] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer] Transaction confirmed in block ${receipt.blockNumber}`);
    
    const mintedEvent = receipt.logs.find(
      (log: any) => log.fragment?.name === 'NFTMinted'
    );
    
    let tokenId: number | undefined;
    if (mintedEvent) {
      tokenId = Number(mintedEvent.args[0]);
      console.log(`[Relayer] Minted token ID: ${tokenId}`);
    }
    
    return {
      success: true,
      tokenId,
      txHash: tx.hash,
    };
  } catch (error) {
    console.error('[Relayer] Collection mint failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function isRelayerConfigured(): boolean {
  return !!(process.env.MNEMONIC && process.env.INFURA_API_KEY);
}

// ============ PRIVACY POOL FUNCTIONS ============

function getPoolContract(): Contract {
  const poolAddress = process.env.VITE_PRIVACY_POOL_ADDRESS;
  if (!poolAddress) {
    throw new Error('Privacy pool contract address not configured');
  }
  const wallet = getRelayerWallet();
  return new Contract(poolAddress, PRIVACY_POOL_ABI, wallet);
}

export function isPoolConfigured(): boolean {
  return !!(process.env.VITE_PRIVACY_POOL_ADDRESS && isRelayerConfigured());
}

export async function getPoolContractAddress(): Promise<string | null> {
  return process.env.VITE_PRIVACY_POOL_ADDRESS || null;
}

export interface PoolDepositResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Check on-chain pool balance for an account
 */
export async function getOnChainPoolBalance(accountHash: string): Promise<string> {
  try {
    const pool = getPoolContract();
    const balance = await pool.getBalance(accountHash);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('[Pool] Failed to get balance:', error);
    return '0';
  }
}

/**
 * Check if account has sufficient balance on-chain
 */
export async function hasSufficientPoolBalance(accountHash: string, amount: string): Promise<boolean> {
  try {
    const pool = getPoolContract();
    const amountWei = ethers.parseEther(amount);
    return await pool.hasSufficientBalance(accountHash, amountWei);
  } catch (error) {
    console.error('[Pool] Failed to check balance:', error);
    return false;
  }
}

/**
 * Get pool statistics from contract
 */
export async function getOnChainPoolStats(): Promise<{ totalBalance: string; totalDeposits: number; totalWithdrawals: number }> {
  try {
    const pool = getPoolContract();
    const [totalBalance, totalDeposits, totalWithdrawals] = await pool.getPoolStats();
    return {
      totalBalance: ethers.formatEther(totalBalance),
      totalDeposits: Number(totalDeposits),
      totalWithdrawals: Number(totalWithdrawals),
    };
  } catch (error) {
    console.error('[Pool] Failed to get stats:', error);
    return { totalBalance: '0', totalDeposits: 0, totalWithdrawals: 0 };
  }
}

/**
 * Deduct from pool for minting (called by relayer)
 */
export async function deductFromPool(accountHash: string, amount: string): Promise<PoolDepositResult> {
  try {
    const pool = getPoolContract();
    const amountWei = ethers.parseEther(amount);
    
    console.log(`[Pool] Deducting ${amount} ETH from account ${accountHash.substring(0, 10)}...`);
    
    const tx = await pool.deductForMint(accountHash, amountWei);
    const receipt = await tx.wait();
    
    console.log(`[Pool] Deduction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Pool] Deduction failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to deduct from pool',
    };
  }
}

/**
 * Withdraw from pool to user's wallet
 */
export async function withdrawFromPool(
  accountHash: string,
  amount: string,
  recipientAddress: string
): Promise<PoolDepositResult> {
  try {
    const pool = getPoolContract();
    const amountWei = ethers.parseEther(amount);
    
    console.log(`[Pool] Withdrawing ${amount} ETH...`);
    
    const tx = await pool.withdraw(accountHash, amountWei, recipientAddress);
    const receipt = await tx.wait();
    
    console.log(`[Pool] Withdrawal confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Pool] Withdrawal failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to withdraw from pool',
    };
  }
}

export interface PrivateMintFromPoolRequest {
  uri: string;
  mintPrice: string;
  encryptedOwner: string;
  inputProof: string;
  accountHash: string;
  contractAddress?: string;
}

/**
 * Mint NFT using funds from the privacy pool
 * This breaks the link between the user's deposit and the minting transaction
 */
export async function privateMintFromPool(request: PrivateMintFromPoolRequest): Promise<PrivateMintResult> {
  try {
    const wallet = getRelayerWallet();
    const contractAddress = request.contractAddress || process.env.VITE_NFT_CONTRACT_ADDRESS;
    
    if (!contractAddress) {
      throw new Error('NFT contract address not configured');
    }

    console.log(`[PoolMint] Starting private mint from pool...`);
    console.log(`[PoolMint] Account hash: ${request.accountHash.substring(0, 10)}...`);
    console.log(`[PoolMint] Mint price: ${request.mintPrice} ETH`);

    // First, deduct from the pool to fund the relayer
    const deductResult = await deductFromPool(request.accountHash, request.mintPrice);
    if (!deductResult.success) {
      return {
        success: false,
        error: `Pool deduction failed: ${deductResult.error}`,
      };
    }

    console.log(`[PoolMint] Pool deduction successful, tx: ${deductResult.txHash}`);
    
    // Now mint using the relayer's received funds
    const nftContract = new Contract(contractAddress, NFT_ABI, wallet);
    const priceWei = ethers.parseEther(request.mintPrice);
    
    console.log(`[PoolMint] Submitting mint transaction...`);
    
    const tx = await nftContract.mint(
      request.uri,
      priceWei,
      request.encryptedOwner,
      request.inputProof
    );
    
    console.log(`[PoolMint] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[PoolMint] Transaction confirmed in block ${receipt.blockNumber}`);
    
    const mintedEvent = receipt.logs.find(
      (log: any) => log.fragment?.name === 'Minted'
    );
    
    let tokenId: number | undefined;
    if (mintedEvent) {
      tokenId = Number(mintedEvent.args[0]);
      console.log(`[PoolMint] Minted token ID: ${tokenId}`);
    } else {
      const supply = await nftContract.totalSupply();
      tokenId = Number(supply) - 1;
      console.log(`[PoolMint] Inferred token ID from supply: ${tokenId}`);
    }
    
    return {
      success: true,
      tokenId,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[PoolMint] Mint failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Unknown error',
    };
  }
}

export interface RelayerListRequest {
  collectionAddress: string;
  tokenId: number;
  price: string;
  encryptedSeller: string;
  inputProof: string;
}

export interface RelayerListResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * List NFT via relayer - for pool-minted NFTs where the relayer is the on-chain owner
 * This allows users to list NFTs that were minted via the privacy pool
 */
export async function listNFTViaRelayer(request: RelayerListRequest): Promise<RelayerListResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer List] Starting listing for token ${request.tokenId}...`);
    console.log(`[Relayer List] Collection: ${request.collectionAddress}`);
    console.log(`[Relayer List] Price: ${request.price} ETH`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    // Verify the relayer owns this token
    const owner = await collection.ownerOf(request.tokenId);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      return {
        success: false,
        error: `Relayer is not the owner of token ${request.tokenId}. Owner: ${owner}`,
      };
    }
    
    const priceWei = ethers.parseEther(request.price);
    
    console.log(`[Relayer List] Submitting list transaction...`);
    
    const tx = await collection.listNFT(
      request.tokenId,
      priceWei,
      request.encryptedSeller,
      request.inputProof
    );
    
    console.log(`[Relayer List] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer List] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer List] Listing failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to list NFT via relayer',
    };
  }
}

/**
 * Check if the relayer is the owner of a specific token
 */
export async function isRelayerOwner(collectionAddress: string, tokenId: number): Promise<boolean> {
  try {
    const wallet = getRelayerWallet();
    const collection = new Contract(collectionAddress, COLLECTION_ABI, wallet);
    const owner = await collection.ownerOf(tokenId);
    return owner.toLowerCase() === wallet.address.toLowerCase();
  } catch (error) {
    console.error('[Relayer] Failed to check ownership:', error);
    return false;
  }
}

/**
 * Get the on-chain owner address of a specific token
 */
export async function getOnChainOwner(collectionAddress: string, tokenId: number): Promise<string | null> {
  try {
    const wallet = getRelayerWallet();
    const collection = new Contract(collectionAddress, COLLECTION_ABI, wallet);
    const owner = await collection.ownerOf(tokenId);
    return owner;
  } catch (error) {
    console.error('[Relayer] Failed to get on-chain owner:', error);
    return null;
  }
}

export interface RelayerUnlistRequest {
  collectionAddress: string;
  tokenId: number;
}

export interface RelayerUnlistResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Unlist NFT via relayer - for pool-minted NFTs where the relayer is the on-chain owner
 */
export async function unlistNFTViaRelayer(request: RelayerUnlistRequest): Promise<RelayerUnlistResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer Unlist] Starting unlist for token ${request.tokenId}...`);
    console.log(`[Relayer Unlist] Collection: ${request.collectionAddress}`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    // Verify the relayer owns this token
    const owner = await collection.ownerOf(request.tokenId);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      return {
        success: false,
        error: `Relayer is not the owner of token ${request.tokenId}. Owner: ${owner}`,
      };
    }
    
    // Verify the token is listed
    const listed = await collection.isListed(request.tokenId);
    if (!listed) {
      return {
        success: false,
        error: `Token ${request.tokenId} is not listed`,
      };
    }
    
    console.log(`[Relayer Unlist] Submitting unlist transaction...`);
    
    const tx = await collection.unlistNFT(request.tokenId);
    
    console.log(`[Relayer Unlist] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer Unlist] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer Unlist] Unlisting failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to unlist NFT via relayer',
    };
  }
}

export interface RelayerBuyRequest {
  collectionAddress: string;
  tokenId: number;
  price: string;
  encryptedBuyer: string;
  inputProof: string;
}

export interface RelayerBuyResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Buy NFT via relayer - uses pool funds to purchase an NFT
 */
export async function buyNFTViaRelayer(request: RelayerBuyRequest): Promise<RelayerBuyResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer Buy] Starting purchase for token ${request.tokenId}...`);
    console.log(`[Relayer Buy] Collection: ${request.collectionAddress}`);
    console.log(`[Relayer Buy] Price: ${request.price} ETH`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    // Verify the token is listed
    const listed = await collection.isListed(request.tokenId);
    if (!listed) {
      return {
        success: false,
        error: `Token ${request.tokenId} is not listed for sale`,
      };
    }
    
    const priceWei = ethers.parseEther(request.price);
    
    console.log(`[Relayer Buy] Submitting buy transaction...`);
    
    const tx = await collection.buyNFT(
      request.tokenId,
      request.encryptedBuyer,
      request.inputProof,
      { value: priceWei }
    );
    
    console.log(`[Relayer Buy] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer Buy] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer Buy] Purchase failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to buy NFT via relayer',
    };
  }
}

export interface RelayerMakeOfferRequest {
  collectionAddress: string;
  tokenId: number;
  amount: string;
  encryptedOfferer: string;
  inputProof: string;
}

export interface RelayerMakeOfferResult {
  success: boolean;
  offerId?: number;
  txHash?: string;
  error?: string;
}

/**
 * Make an offer on an NFT via relayer - uses pool funds
 */
export async function makeOfferViaRelayer(request: RelayerMakeOfferRequest): Promise<RelayerMakeOfferResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer Offer] Making offer for token ${request.tokenId}...`);
    console.log(`[Relayer Offer] Collection: ${request.collectionAddress}`);
    console.log(`[Relayer Offer] Amount: ${request.amount} ETH`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    const amountWei = ethers.parseEther(request.amount);
    
    console.log(`[Relayer Offer] Submitting offer transaction...`);
    
    const tx = await collection.makeOffer(
      request.tokenId,
      request.encryptedOfferer,
      request.inputProof,
      { value: amountWei }
    );
    
    console.log(`[Relayer Offer] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer Offer] Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Extract offerId from event
    const offerEvent = receipt.logs.find(
      (log: any) => log.fragment?.name === 'OfferCreated'
    );
    
    const offerId = offerEvent ? Number(offerEvent.args[0]) : undefined;
    
    return {
      success: true,
      offerId,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer Offer] Make offer failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to make offer via relayer',
    };
  }
}

export interface RelayerCancelOfferRequest {
  collectionAddress: string;
  offerId: number;
}

export interface RelayerCancelOfferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Cancel an offer via relayer - returns pool funds
 */
export async function cancelOfferViaRelayer(request: RelayerCancelOfferRequest): Promise<RelayerCancelOfferResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer Cancel Offer] Canceling offer ${request.offerId}...`);
    console.log(`[Relayer Cancel Offer] Collection: ${request.collectionAddress}`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    // Verify the relayer made this offer
    const [offerer, , isActive] = await collection.getOffer(request.offerId);
    if (!isActive) {
      return {
        success: false,
        error: `Offer ${request.offerId} is not active`,
      };
    }
    if (offerer.toLowerCase() !== wallet.address.toLowerCase()) {
      return {
        success: false,
        error: `Relayer is not the offerer of offer ${request.offerId}`,
      };
    }
    
    console.log(`[Relayer Cancel Offer] Submitting cancel transaction...`);
    
    const tx = await collection.cancelOffer(request.offerId);
    
    console.log(`[Relayer Cancel Offer] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer Cancel Offer] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer Cancel Offer] Cancel failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to cancel offer via relayer',
    };
  }
}

export interface RelayerAcceptOfferRequest {
  collectionAddress: string;
  offerId: number;
  encryptedNewOwner: string;
  inputProof: string;
}

export interface RelayerAcceptOfferResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Accept an offer via relayer - for pool-minted NFTs where the relayer is the owner
 */
export async function acceptOfferViaRelayer(request: RelayerAcceptOfferRequest): Promise<RelayerAcceptOfferResult> {
  try {
    const wallet = getRelayerWallet();
    
    console.log(`[Relayer Accept Offer] Accepting offer ${request.offerId}...`);
    console.log(`[Relayer Accept Offer] Collection: ${request.collectionAddress}`);
    
    const collection = new Contract(request.collectionAddress, COLLECTION_ABI, wallet);
    
    // Verify the offer is active
    const [, , isActive] = await collection.getOffer(request.offerId);
    if (!isActive) {
      return {
        success: false,
        error: `Offer ${request.offerId} is not active`,
      };
    }
    
    console.log(`[Relayer Accept Offer] Submitting accept transaction...`);
    
    const tx = await collection.acceptOffer(
      request.offerId,
      request.encryptedNewOwner,
      request.inputProof
    );
    
    console.log(`[Relayer Accept Offer] Transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`[Relayer Accept Offer] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error: any) {
    console.error('[Relayer Accept Offer] Accept failed:', error);
    return {
      success: false,
      error: error.reason || error.message || 'Failed to accept offer via relayer',
    };
  }
}

/**
 * Get offer details from on-chain
 */
export async function getOfferDetailsOnChain(
  collectionAddress: string,
  offerId: number
): Promise<{ offerer: string; amount: string; isActive: boolean; createdAt: number } | null> {
  try {
    const wallet = getRelayerWallet();
    const collection = new Contract(collectionAddress, COLLECTION_ABI, wallet);
    
    const [offerer, amount, isActive, createdAt] = await collection.getOffer(offerId);
    
    return {
      offerer,
      amount: ethers.formatEther(amount),
      isActive,
      createdAt: Number(createdAt),
    };
  } catch (error) {
    console.error('[Relayer] Failed to get offer details:', error);
    return null;
  }
}

/**
 * Get all offers for a token from on-chain
 */
export async function getTokenOffersOnChain(
  collectionAddress: string,
  tokenId: number
): Promise<number[]> {
  try {
    const wallet = getRelayerWallet();
    const collection = new Contract(collectionAddress, COLLECTION_ABI, wallet);
    
    const offerIds = await collection.getTokenOffers(tokenId);
    
    return offerIds.map((id: bigint) => Number(id));
  } catch (error) {
    console.error('[Relayer] Failed to get token offers:', error);
    return [];
  }
}

export interface OnChainListingStatus {
  isListed: boolean;
  price?: string;
}

/**
 * Check the on-chain listing status of an NFT
 * This verifies the actual blockchain state, not just database records
 */
export async function checkOnChainListingStatus(
  collectionAddress: string,
  tokenId: number
): Promise<OnChainListingStatus> {
  try {
    const wallet = getRelayerWallet();
    const collection = new Contract(collectionAddress, COLLECTION_ABI, wallet);
    
    const isListed = await collection.isListed(tokenId);
    
    let price: string | undefined;
    if (isListed) {
      const priceWei = await collection.listingPrices(tokenId);
      price = ethers.formatEther(priceWei);
    }
    
    return { isListed, price };
  } catch (error) {
    console.error('[Relayer] Failed to check on-chain listing status:', error);
    return { isListed: false };
  }
}
