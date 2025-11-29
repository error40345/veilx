export const FHEVM_CONFIG = {
  chainId: 11155111,
  chainName: "Ethereum Sepolia",
  rpcUrl: "https://eth-sepolia.public.blastapi.io",
  blockExplorer: "https://sepolia.etherscan.io",
  
  gatewayChainId: 55815,
  relayerUrl: "https://relayer.testnet.zama.cloud",
  
  aclAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  coprocessorAddress: "0x92C920834Ec8941d2C77D188936E1f7A6f49c127",
  kmsVerifierAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  
  nativeCurrency: {
    name: "Sepolia ETH",
    symbol: "ETH",
    decimals: 18,
  },
} as const;

export type FhevmConfig = typeof FHEVM_CONFIG;

export function getContractAddresses(): { nft: string; marketplace: string; collectionFactory: string } {
  const isClient = typeof window !== 'undefined';
  
  if (isClient && typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      nft: import.meta.env.VITE_NFT_CONTRACT_ADDRESS || "",
      marketplace: import.meta.env.VITE_MARKETPLACE_ADDRESS || "",
      collectionFactory: import.meta.env.VITE_COLLECTION_FACTORY_ADDRESS || "",
    };
  }
  
  if (typeof process !== 'undefined' && process.env) {
    return {
      nft: process.env.VITE_NFT_CONTRACT_ADDRESS || "",
      marketplace: process.env.VITE_MARKETPLACE_ADDRESS || "",
      collectionFactory: process.env.VITE_COLLECTION_FACTORY_ADDRESS || "",
    };
  }
  
  return {
    nft: "",
    marketplace: "",
    collectionFactory: "",
  };
}

export function hasContractAddresses(): boolean {
  const addresses = getContractAddresses();
  return Boolean(addresses.nft && addresses.marketplace);
}

export function hasCollectionFactoryAddress(): boolean {
  const addresses = getContractAddresses();
  return Boolean(addresses.collectionFactory);
}
