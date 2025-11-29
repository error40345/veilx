import { ethers, BrowserProvider, Contract } from 'ethers';
import { getContractAddresses, hasContractAddresses, hasCollectionFactoryAddress, FHEVM_CONFIG } from '@shared/fhevm-config';

function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

const NFT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function marketplace() view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function mintPrices(uint256 tokenId) view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function mint(string uri, uint256 mintPrice, bytes32 encryptedOwner, bytes inputProof) returns (uint256)",
  "function approve(uint256 tokenId, address approved)",
  "function transfer(uint256 tokenId, address to)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "event Transfer(uint256 indexed tokenId, address indexed from, address indexed to)",
  "event Minted(uint256 indexed tokenId, address indexed minter, string uri, uint256 mintPrice)",
  "event Approval(uint256 indexed tokenId, address indexed owner, address indexed approved)",
];

const MARKETPLACE_ABI = [
  "function nftContract() view returns (address)",
  "function owner() view returns (address)",
  "function totalVolume() view returns (uint256)",
  "function floorPrice() view returns (uint256)",
  "function getTotalListings() view returns (uint256)",
  "function getTotalTrades() view returns (uint256)",
  "function getStats() view returns (uint256 _totalVolume, uint256 _floorPrice, uint256 _totalListings, uint256 _totalTrades)",
  "function getListing(uint256 listingId) view returns (uint256 nftId, uint256 price, bool isActive, uint256 createdAt, address seller)",
  "function getTrade(uint256 tradeId) view returns (uint256 nftId, uint256 price, uint256 timestamp, address buyer, address seller)",
  "function getActiveListings() view returns (uint256[] listingIds, uint256[] prices, uint256[] nftIds)",
  "function activeListingByNft(uint256 nftId) view returns (uint256)",
  "function createListing(uint256 nftId, uint256 price, bytes32 encryptedSeller, bytes inputProof) returns (uint256)",
  "function buy(uint256 listingId, bytes32 encryptedBuyer, bytes inputProof) payable returns (uint256)",
  "function cancelListing(uint256 listingId)",
  "event Listed(uint256 indexed listingId, uint256 indexed nftId, address indexed seller, uint256 price)",
  "event Sold(uint256 indexed listingId, uint256 indexed nftId, address indexed buyer, uint256 price)",
  "event ListingCancelled(uint256 indexed listingId, uint256 indexed nftId)",
];

const COLLECTION_FACTORY_ABI = [
  "function owner() view returns (address)",
  "function deploymentFee() view returns (uint256)",
  "function getCollectionCount() view returns (uint256)",
  "function getCollection(uint256 collectionId) view returns (address contractAddress, string name, string symbol, uint256 totalSupply, uint256 mintPrice, uint256 createdAt, bool isActive)",
  "function getActiveCollections() view returns (uint256[])",
  "function getCreatorCollections(address creator) view returns (uint256[])",
  "function isVeilXCollection(address) view returns (bool)",
  "function deployCollection(string name, string symbol, string baseUri, uint256 totalSupply, uint256 mintPrice, bytes32 encryptedCreatorInput, bytes calldata inputProof) payable returns (uint256 collectionId, address collectionAddress)",
  "function deactivateCollection(uint256 collectionId)",
  "event CollectionDeployed(uint256 indexed collectionId, address indexed contractAddress, string name, string symbol, uint256 totalSupply, uint256 mintPrice)",
  "event CollectionDeactivated(uint256 indexed collectionId)",
];

const VEILX_COLLECTION_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function baseUri() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function creator() view returns (address)",
  "function currentTokenId() view returns (uint256)",
  "function mintedCount() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isListed(uint256 tokenId) view returns (bool)",
  "function listingPrices(uint256 tokenId) view returns (uint256)",
  "function getTokenUri(uint256 tokenId) view returns (string)",
  "function getListing(uint256 tokenId) view returns (bool listed, uint256 price)",
  "function getCollectionInfo() view returns (string _name, string _symbol, uint256 _totalSupply, uint256 _mintedCount, uint256 _mintPrice, address _creator)",
  "function remainingSupply() view returns (uint256)",
  "function isSoldOut() view returns (bool)",
  "function mint(string tokenUri, bytes32 encryptedOwnerInput, bytes calldata inputProof) payable returns (uint256)",
  "function listNFT(uint256 tokenId, uint256 price, bytes32 encryptedSellerInput, bytes calldata inputProof)",
  "function unlistNFT(uint256 tokenId)",
  "function buyNFT(uint256 tokenId, bytes32 encryptedBuyerInput, bytes calldata inputProof) payable",
  "function transferNFT(uint256 tokenId, address to, bytes32 encryptedNewOwnerInput, bytes calldata inputProof)",
  "function withdraw()",
  "function makeOffer(uint256 tokenId, bytes32 encryptedOffererInput, bytes calldata inputProof) payable returns (uint256)",
  "function cancelOffer(uint256 offerId)",
  "function acceptOffer(uint256 offerId, bytes32 encryptedNewOwnerInput, bytes calldata inputProof)",
  "function getOffer(uint256 offerId) view returns (address offerer, uint256 amount, bool isActive, uint256 createdAt)",
  "function getTokenOffers(uint256 tokenId) view returns (uint256[])",
  "function getUserOffers(address user) view returns (uint256[])",
  "event NFTMinted(uint256 indexed tokenId, uint256 mintPrice, uint256 timestamp)",
  "event NFTListed(uint256 indexed tokenId, uint256 price, uint256 timestamp)",
  "event NFTUnlisted(uint256 indexed tokenId, uint256 timestamp)",
  "event NFTSold(uint256 indexed tokenId, uint256 price, uint256 timestamp)",
  "event NFTTransferred(uint256 indexed tokenId, uint256 timestamp)",
  "event OfferCreated(uint256 indexed offerId, uint256 indexed tokenId, uint256 amount, uint256 timestamp)",
  "event OfferCanceled(uint256 indexed offerId, uint256 indexed tokenId, uint256 timestamp)",
  "event OfferAccepted(uint256 indexed offerId, uint256 indexed tokenId, uint256 amount, uint256 timestamp)",
];

let provider: BrowserProvider | null = null;
let nftContract: Contract | null = null;
let marketplaceContract: Contract | null = null;
let factoryContract: Contract | null = null;

export function isContractConfigured(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return hasContractAddresses();
}

export function getContractAddressesOrThrow(): { nft: string; marketplace: string } {
  const addresses = getContractAddresses();
  
  if (!addresses.nft || !addresses.marketplace) {
    throw new Error(
      "Contract addresses not configured. Set VITE_NFT_CONTRACT_ADDRESS and VITE_MARKETPLACE_ADDRESS environment variables."
    );
  }
  
  return addresses as { nft: string; marketplace: string };
}

export async function getProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }
  
  if (!provider) {
    provider = new BrowserProvider(window.ethereum);
  }
  
  return provider;
}

export async function getNFTContract(signerRequired = false): Promise<Contract> {
  const addresses = getContractAddresses();
  
  if (!addresses.nft) {
    throw new Error("NFT contract address not configured");
  }
  
  const browserProvider = await getProvider();
  
  if (signerRequired) {
    const signer = await browserProvider.getSigner();
    return new Contract(addresses.nft, NFT_ABI, signer);
  }
  
  if (!nftContract) {
    nftContract = new Contract(addresses.nft, NFT_ABI, browserProvider);
  }
  
  return nftContract;
}

export async function getMarketplaceContract(signerRequired = false): Promise<Contract> {
  const addresses = getContractAddresses();
  
  if (!addresses.marketplace) {
    throw new Error("Marketplace contract address not configured");
  }
  
  const browserProvider = await getProvider();
  
  if (signerRequired) {
    const signer = await browserProvider.getSigner();
    return new Contract(addresses.marketplace, MARKETPLACE_ABI, signer);
  }
  
  if (!marketplaceContract) {
    marketplaceContract = new Contract(addresses.marketplace, MARKETPLACE_ABI, browserProvider);
  }
  
  return marketplaceContract;
}

export interface MarketStats {
  totalVolume: string;
  floorPrice: string;
  totalListings: number;
  totalTrades: number;
  totalSupply: number;
}

export async function getMarketStats(): Promise<MarketStats> {
  try {
    const marketplace = await getMarketplaceContract();
    const nft = await getNFTContract();
    
    const [volume, floor, listings, trades] = await marketplace.getStats();
    const totalSupply = await nft.totalSupply();
    
    return {
      totalVolume: ethers.formatEther(volume),
      floorPrice: floor > BigInt(0) ? ethers.formatEther(floor) : "0",
      totalListings: Number(listings),
      totalTrades: Number(trades),
      totalSupply: Number(totalSupply),
    };
  } catch (error) {
    console.error("Failed to fetch market stats:", error);
    return {
      totalVolume: "0",
      floorPrice: "0",
      totalListings: 0,
      totalTrades: 0,
      totalSupply: 0,
    };
  }
}

export interface NFTData {
  tokenId: number;
  tokenURI: string;
  owner: string;
  mintPrice: string;
  listingId?: number;
  listingPrice?: string;
  isListed: boolean;
}

export async function getAllNFTs(): Promise<NFTData[]> {
  try {
    const nft = await getNFTContract();
    const marketplace = await getMarketplaceContract();
    
    const totalSupply = await nft.totalSupply();
    const nfts: NFTData[] = [];
    
    for (let i = 0; i < Number(totalSupply); i++) {
      try {
        const tokenURI = await nft.tokenURI(i);
        const owner = await nft.ownerOf(i);
        const mintPrice = await nft.mintPrices(i);
        const listingId = await marketplace.activeListingByNft(i);
        
        let listingPrice: string | undefined;
        let isListed = false;
        
        if (listingId > BigInt(0)) {
          const [, price, isActive] = await marketplace.getListing(listingId);
          if (isActive) {
            isListed = true;
            listingPrice = ethers.formatEther(price);
          }
        }
        
        nfts.push({
          tokenId: i,
          tokenURI,
          owner,
          mintPrice: ethers.formatEther(mintPrice),
          listingId: listingId > BigInt(0) ? Number(listingId) : undefined,
          listingPrice,
          isListed,
        });
      } catch (e) {
        console.warn(`Failed to fetch NFT ${i}:`, e);
      }
    }
    
    return nfts;
  } catch (error) {
    console.error("Failed to fetch NFTs:", error);
    return [];
  }
}

export async function mintNFT(
  uri: string,
  mintPrice: string,
  encryptedOwner: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<number> {
  const nft = await getNFTContract(true);
  
  const priceWei = ethers.parseEther(mintPrice);
  
  const handleHex = encryptedOwner instanceof Uint8Array 
    ? '0x' + toHexString(encryptedOwner)
    : encryptedOwner;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  const tx = await nft.mint(uri, priceWei, handleHex, proofHex);
  const receipt = await tx.wait();
  
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'Minted'
  );
  
  if (event) {
    return Number(event.args[0]);
  }
  
  throw new Error("Mint event not found");
}

export async function approveForMarketplace(tokenId: number): Promise<void> {
  const nft = await getNFTContract(true);
  const addresses = getContractAddresses();
  
  const tx = await nft.approve(tokenId, addresses.marketplace);
  await tx.wait();
}

export async function createListing(
  nftId: number,
  price: string,
  encryptedSeller: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<number> {
  const marketplace = await getMarketplaceContract(true);
  
  const priceWei = ethers.parseEther(price);
  
  const handleHex = encryptedSeller instanceof Uint8Array 
    ? '0x' + toHexString(encryptedSeller)
    : encryptedSeller;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  const tx = await marketplace.createListing(nftId, priceWei, handleHex, proofHex);
  const receipt = await tx.wait();
  
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'Listed'
  );
  
  if (event) {
    return Number(event.args[0]);
  }
  
  throw new Error("Listed event not found");
}

export async function buyNFT(
  listingId: number,
  price: string,
  encryptedBuyer: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<number> {
  const marketplace = await getMarketplaceContract(true);
  
  const priceWei = ethers.parseEther(price);
  
  const handleHex = encryptedBuyer instanceof Uint8Array 
    ? '0x' + toHexString(encryptedBuyer)
    : encryptedBuyer;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  const tx = await marketplace.buy(listingId, handleHex, proofHex, {
    value: priceWei,
  });
  const receipt = await tx.wait();
  
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'Sold'
  );
  
  if (event) {
    return Number(event.args[0]);
  }
  
  throw new Error("Sold event not found");
}

export async function cancelListing(listingId: number): Promise<void> {
  const marketplace = await getMarketplaceContract(true);
  
  const tx = await marketplace.cancelListing(listingId);
  await tx.wait();
}

export function isCollectionFactoryConfigured(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return hasCollectionFactoryAddress();
}

export function getCollectionFactoryAddress(): string | null {
  const addresses = getContractAddresses();
  return addresses.collectionFactory || null;
}

export async function getCollectionFactoryContract(signerRequired = false): Promise<Contract> {
  const addresses = getContractAddresses();
  
  if (!addresses.collectionFactory) {
    throw new Error("Collection Factory contract address not configured");
  }
  
  const browserProvider = await getProvider();
  
  if (signerRequired) {
    const signer = await browserProvider.getSigner();
    return new Contract(addresses.collectionFactory, COLLECTION_FACTORY_ABI, signer);
  }
  
  if (!factoryContract) {
    factoryContract = new Contract(addresses.collectionFactory, COLLECTION_FACTORY_ABI, browserProvider);
  }
  
  return factoryContract;
}

export async function getVeilXCollectionContract(address: string, signerRequired = false): Promise<Contract> {
  const browserProvider = await getProvider();
  
  if (signerRequired) {
    const signer = await browserProvider.getSigner();
    return new Contract(address, VEILX_COLLECTION_ABI, signer);
  }
  
  return new Contract(address, VEILX_COLLECTION_ABI, browserProvider);
}

export interface DeployedCollection {
  id: number;
  contractAddress: string;
  name: string;
  symbol: string;
  totalSupply: number;
  mintedCount: number;
  mintPrice: string;
  creator: string;
  isActive: boolean;
  createdAt: number;
  isSoldOut: boolean;
}

export async function deployCollection(
  name: string,
  symbol: string,
  baseUri: string,
  totalSupply: number,
  mintPrice: string,
  encryptedCreator: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<{ collectionId: number; contractAddress: string }> {
  const factory = await getCollectionFactoryContract(true);
  
  const deploymentFee = await factory.deploymentFee();
  const priceWei = ethers.parseEther(mintPrice);
  
  const handleHex = encryptedCreator instanceof Uint8Array 
    ? '0x' + toHexString(encryptedCreator)
    : encryptedCreator;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  console.log('📤 Deploying collection with params:', {
    name,
    symbol,
    baseUri,
    totalSupply,
    mintPrice: priceWei.toString(),
    deploymentFee: deploymentFee.toString(),
  });
  
  console.log('🔐 Handle (hex):', handleHex);
  console.log('📜 Proof (hex, first 100 chars):', proofHex.substring(0, 100) + '...');
  console.log('📜 Proof length:', proofHex.length);
  
  try {
    const tx = await factory.deployCollection(
      name,
      symbol,
      baseUri,
      totalSupply,
      priceWei,
      handleHex,
      proofHex,
      { value: deploymentFee }
    );
    console.log('✅ Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed');
    
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'CollectionDeployed'
    );
    
    if (event) {
      return {
        collectionId: Number(event.args[0]),
        contractAddress: event.args[1],
      };
    }
    
    throw new Error("CollectionDeployed event not found");
  } catch (error: any) {
    console.error('❌ Deployment failed:', error);
    console.error('❌ Error data:', error.data);
    console.error('❌ Error reason:', error.reason);
    throw error;
  }
}

export async function getDeployedCollection(collectionId: number): Promise<DeployedCollection> {
  const factory = await getCollectionFactoryContract();
  
  const [contractAddress, name, symbol, totalSupply, mintPrice, createdAt, isActive] = 
    await factory.getCollection(collectionId);
  
  const collection = await getVeilXCollectionContract(contractAddress);
  const mintedCount = await collection.mintedCount();
  const creator = await collection.creator();
  const soldOut = await collection.isSoldOut();
  
  return {
    id: collectionId,
    contractAddress,
    name,
    symbol,
    totalSupply: Number(totalSupply),
    mintedCount: Number(mintedCount),
    mintPrice: ethers.formatEther(mintPrice),
    creator,
    isActive,
    createdAt: Number(createdAt),
    isSoldOut: soldOut,
  };
}

export async function getActiveDeployedCollections(): Promise<DeployedCollection[]> {
  const factory = await getCollectionFactoryContract();
  
  const activeIds = await factory.getActiveCollections();
  const collections: DeployedCollection[] = [];
  
  for (const id of activeIds) {
    try {
      const collection = await getDeployedCollection(Number(id));
      collections.push(collection);
    } catch (e) {
      console.warn(`Failed to fetch collection ${id}:`, e);
    }
  }
  
  return collections;
}

export async function mintFromCollection(
  collectionAddress: string,
  tokenUri: string,
  mintPrice: string,
  encryptedOwner: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<number> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  const priceWei = ethers.parseEther(mintPrice);
  
  const handleHex = encryptedOwner instanceof Uint8Array 
    ? '0x' + toHexString(encryptedOwner)
    : encryptedOwner;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  console.log('🎨 Minting NFT with handle:', handleHex);
  console.log('🎨 Proof length:', proofHex.length);
  
  const tx = await collection.mint(tokenUri, handleHex, proofHex, {
    value: priceWei,
  });
  const receipt = await tx.wait();
  
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'NFTMinted'
  );
  
  if (event) {
    return Number(event.args[0]);
  }
  
  throw new Error("NFTMinted event not found");
}

export async function listNFTInCollection(
  collectionAddress: string,
  tokenId: number,
  price: string,
  encryptedSeller: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<void> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  const priceWei = ethers.parseEther(price);
  
  const handleHex = encryptedSeller instanceof Uint8Array 
    ? '0x' + toHexString(encryptedSeller)
    : encryptedSeller;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  const tx = await collection.listNFT(tokenId, priceWei, handleHex, proofHex);
  await tx.wait();
}

export async function unlistNFTFromCollection(
  collectionAddress: string,
  tokenId: number
): Promise<string> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  console.log('Unlisting NFT:', tokenId, 'from collection:', collectionAddress);
  
  const tx = await collection.unlistNFT(tokenId);
  const receipt = await tx.wait();
  
  return receipt.hash;
}

export async function buyNFTFromCollection(
  collectionAddress: string,
  tokenId: number,
  price: string,
  encryptedBuyer: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<void> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  const priceWei = ethers.parseEther(price);
  
  const handleHex = encryptedBuyer instanceof Uint8Array 
    ? '0x' + toHexString(encryptedBuyer)
    : encryptedBuyer;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  const tx = await collection.buyNFT(tokenId, handleHex, proofHex, {
    value: priceWei,
  });
  await tx.wait();
}

export async function getDeploymentFee(): Promise<string> {
  const factory = await getCollectionFactoryContract();
  const fee = await factory.deploymentFee();
  return ethers.formatEther(fee);
}

export async function makeOfferOnNFT(
  collectionAddress: string,
  tokenId: number,
  offerAmount: string,
  encryptedOfferer: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<{ offerId: number; txHash: string }> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  const amountWei = ethers.parseEther(offerAmount);
  
  const handleHex = encryptedOfferer instanceof Uint8Array 
    ? '0x' + toHexString(encryptedOfferer)
    : encryptedOfferer;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  console.log('Making offer on NFT:', tokenId, 'amount:', offerAmount);
  
  const tx = await collection.makeOffer(tokenId, handleHex, proofHex, {
    value: amountWei,
  });
  const receipt = await tx.wait();
  
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'OfferCreated'
  );
  
  if (event) {
    return { 
      offerId: Number(event.args[0]),
      txHash: receipt.hash,
    };
  }
  
  throw new Error("OfferCreated event not found");
}

export async function cancelOfferOnNFT(
  collectionAddress: string,
  offerId: number
): Promise<string> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  console.log('Canceling offer:', offerId);
  
  const tx = await collection.cancelOffer(offerId);
  const receipt = await tx.wait();
  
  return receipt.hash;
}

export async function acceptOfferOnNFT(
  collectionAddress: string,
  offerId: number,
  encryptedNewOwner: Uint8Array | string,
  inputProof: Uint8Array | string
): Promise<string> {
  const collection = await getVeilXCollectionContract(collectionAddress, true);
  
  const handleHex = encryptedNewOwner instanceof Uint8Array 
    ? '0x' + toHexString(encryptedNewOwner)
    : encryptedNewOwner;
  
  const proofHex = inputProof instanceof Uint8Array 
    ? '0x' + toHexString(inputProof)
    : inputProof;
  
  console.log('Accepting offer:', offerId);
  
  const tx = await collection.acceptOffer(offerId, handleHex, proofHex);
  const receipt = await tx.wait();
  
  return receipt.hash;
}

export async function getOfferDetails(
  collectionAddress: string,
  offerId: number
): Promise<{ offerer: string; amount: string; isActive: boolean; createdAt: number }> {
  const collection = await getVeilXCollectionContract(collectionAddress, false);
  
  const [offerer, amount, isActive, createdAt] = await collection.getOffer(offerId);
  
  return {
    offerer,
    amount: ethers.formatEther(amount),
    isActive,
    createdAt: Number(createdAt),
  };
}

export async function getTokenOffers(
  collectionAddress: string,
  tokenId: number
): Promise<number[]> {
  const collection = await getVeilXCollectionContract(collectionAddress, false);
  
  const offerIds = await collection.getTokenOffers(tokenId);
  
  return offerIds.map((id: bigint) => Number(id));
}

export async function getUserOffers(
  collectionAddress: string,
  userAddress: string
): Promise<number[]> {
  const collection = await getVeilXCollectionContract(collectionAddress, false);
  
  const offerIds = await collection.getUserOffers(userAddress);
  
  return offerIds.map((id: bigint) => Number(id));
}

export function resetContracts(): void {
  provider = null;
  nftContract = null;
  marketplaceContract = null;
  factoryContract = null;
}
