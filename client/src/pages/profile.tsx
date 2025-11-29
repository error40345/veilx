import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useWallet } from '@/lib/wallet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NftGrid } from '@/components/nft-grid';
import { NftDetailsModal } from '@/components/nft-details-modal';
import { ListModal } from '@/components/list-modal';
import { EncryptionBadge } from '@/components/encryption-badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { listNFTInCollection, unlistNFTFromCollection } from '@/lib/contracts';
import { createEncryptedInput, createEncryptedAddressInput } from '@/lib/fhevm';
import { signListRequest, signUnlistRequest } from '@/lib/signing';
import type { Collection } from '@shared/schema';
import { 
  User, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Image,
  ArrowUpRight,
  ArrowDownLeft,
  Tag,
  Sparkles
} from 'lucide-react';
import { Link } from 'wouter';
import type { NftWithListing } from '@shared/schema';

interface ProfileData {
  ownedNfts: NftWithListing[];
  activity: ActivityItem[];
  stats: {
    nftsOwned: number;
    totalSpent: string;
    totalEarned: string;
    totalTrades: number;
  };
}

interface ActivityItem {
  id: string;
  type: 'mint' | 'list' | 'sale' | 'transfer';
  nftId: string;
  nftName: string;
  nftImage: string;
  price?: string;
  role?: 'buyer' | 'seller' | 'minter' | 'lister';
  timestamp: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'mint':
      return <Sparkles className="h-4 w-4 text-green-500" />;
    case 'list':
      return <Tag className="h-4 w-4 text-blue-500" />;
    case 'sale':
      return <ArrowUpRight className="h-4 w-4 text-purple-500" />;
    case 'transfer':
      return <ArrowDownLeft className="h-4 w-4 text-orange-500" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

function getActivityLabel(item: ActivityItem) {
  if (item.role === 'buyer') return 'Bought';
  if (item.role === 'seller') return 'Sold';
  if (item.role === 'minter') return 'Minted';
  if (item.role === 'lister') return 'Listed';
  
  switch (item.type) {
    case 'mint':
      return 'Minted';
    case 'list':
      return 'Listed';
    case 'sale':
      return 'Sale';
    case 'transfer':
      return 'Transfer';
    default:
      return item.type;
  }
}

export default function Profile() {
  const { isConnected, encryptedAddress, address } = useWallet();
  const { toast } = useToast();
  
  const [selectedNft, setSelectedNft] = useState<NftWithListing | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [nftToList, setNftToList] = useState<NftWithListing | null>(null);

  const { data: profileData, isLoading } = useQuery<ProfileData>({
    queryKey: ['/api/profile', encryptedAddress],
    queryFn: async () => {
      if (!encryptedAddress) throw new Error('Not connected');
      const res = await fetch(`/api/profile/${encodeURIComponent(encryptedAddress)}`);
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
    enabled: !!encryptedAddress,
  });

  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ['/api/collections'],
  });

  const listMutation = useMutation({
    mutationFn: async ({ nftId, price, nft }: { nftId: string; price: string; nft: NftWithListing }) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      
      const collection = collections.find(c => c.id === nft.collectionId);
      if (!collection?.contractAddress) {
        throw new Error('Collection contract address not found');
      }
      
      const toHexString = (bytes: Uint8Array): string => {
        return '0x' + Array.from(bytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      
      // Check if relayer is available and get its address
      const relayerStatusRes = await fetch('/api/relayer/status');
      const relayerStatus = await relayerStatusRes.json();
      
      // For relayer listings, create encrypted input with relayer's address
      // because the relayer will be the one calling the contract
      // The contract expects externalEuint64 (64-bit), so we use a random seller ID
      if (relayerStatus.available && relayerStatus.relayerAddress) {
        console.log('Creating 64-bit encrypted input for relayer listing...');
        
        // Generate a random 64-bit seller ID (same approach as pool minting)
        const sellerId = BigInt(Math.floor(Math.random() * 1000000000));
        
        const encryptedInput = await createEncryptedInput(
          collection.contractAddress,
          relayerStatus.relayerAddress,  // Relayer is msg.sender
          sellerId,
          64  // 64-bit to match externalEuint64
        );
        
        const handleHex = encryptedInput.handle instanceof Uint8Array 
          ? toHexString(encryptedInput.handle)
          : encryptedInput.handle;
        
        const proofHex = encryptedInput.proof instanceof Uint8Array
          ? toHexString(encryptedInput.proof)
          : encryptedInput.proof;
        
        // Get signer for EIP-712 signature
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Request wallet signature for authorization
        const signedRequest = await signListRequest(signer, nftId, price);
        
        // Try to list via relayer (for pool-minted NFTs)
        try {
          const relayerResponse = await apiRequest('POST', '/api/listings/relayer', {
            nftId,
            price,
            encryptedSeller: encryptedAddress,
            encryptedHandle: handleHex,
            inputProof: proofHex,
            signedRequest, // EIP-712 signature for authorization
          });
          return relayerResponse;
        } catch (relayerError: any) {
          // If relayer is not the owner, fall back to direct on-chain listing
          const errorMessage = relayerError.message || '';
          if (errorMessage.includes('relayer is not the on-chain owner') || 
              errorMessage.includes('not the owner')) {
            console.log('Relayer not owner, falling back to direct listing via MetaMask...');
          } else {
            throw relayerError;
          }
        }
      }
      
      // Direct on-chain listing via MetaMask (user owns the NFT on-chain)
      console.log('Using direct listing via MetaMask...');
      
      // For direct listing, also use 64-bit encrypted value
      const sellerId = BigInt(Math.floor(Math.random() * 1000000000));
      const encryptedInput = await createEncryptedInput(
        collection.contractAddress,
        address,
        sellerId,
        64
      );
      
      const handleHex = encryptedInput.handle instanceof Uint8Array 
        ? toHexString(encryptedInput.handle)
        : encryptedInput.handle;
      
      const proofHex = encryptedInput.proof instanceof Uint8Array
        ? toHexString(encryptedInput.proof)
        : encryptedInput.proof;
      
      await listNFTInCollection(
        collection.contractAddress,
        nft.tokenId,
        price,
        handleHex,
        proofHex
      );
      
      return apiRequest('POST', '/api/listings', {
        nftId,
        price,
        encryptedSeller: encryptedAddress,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile', encryptedAddress] });
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: 'NFT Listed Successfully',
        description: 'Your NFT is now listed on the blockchain marketplace',
      });
      setIsListOpen(false);
      setNftToList(null);
      setIsDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Listing Failed',
        description: error.message || 'Failed to list NFT on blockchain',
        variant: 'destructive',
      });
    },
  });

  const cancelListingMutation = useMutation({
    mutationFn: async ({ nft }: { nft: NftWithListing }) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      
      const collection = collections.find(c => c.id === nft.collectionId);
      if (!collection?.contractAddress) {
        throw new Error('Collection contract address not found');
      }
      
      // Get signer for EIP-712 signature
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Request wallet signature for authorization
      const signedRequest = await signUnlistRequest(signer, nft.id);
      
      // First, try to unlist via relayer (for pool-minted NFTs)
      try {
        const relayerResponse = await apiRequest('POST', '/api/relayer/unlist', {
          nftId: nft.id,
          encryptedOwner: encryptedAddress,
          signedRequest, // EIP-712 signature for authorization
        });
        return relayerResponse;
      } catch (relayerError: any) {
        // If relayer is not the owner, fall back to direct on-chain unlisting
        const errorMessage = relayerError.message || '';
        if (errorMessage.includes('not the on-chain owner') || 
            errorMessage.includes('not the owner') ||
            errorMessage.includes('needsDirectUnlist')) {
          console.log('Relayer not owner, falling back to direct unlisting via MetaMask...');
          
          // Direct on-chain unlisting via MetaMask
          const txHash = await unlistNFTFromCollection(
            collection.contractAddress,
            nft.tokenId
          );
          
          // Update database to reflect the cancellation
          await apiRequest('POST', '/api/listings/cancel', {
            nftId: nft.id,
          });
          
          return { success: true, txHash };
        }
        throw relayerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile', encryptedAddress] });
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: 'Listing Canceled',
        description: 'Your NFT has been unlisted from the marketplace',
      });
      setIsDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Cancel Listing Failed',
        description: error.message || 'Failed to cancel listing on blockchain',
        variant: 'destructive',
      });
    },
  });

  const handleCancelListing = (nft: NftWithListing) => {
    cancelListingMutation.mutate({ nft });
  };

  const handleViewDetails = (nft: NftWithListing) => {
    setSelectedNft(nft);
    setIsDetailsOpen(true);
  };

  const handleListClick = (nft: NftWithListing) => {
    setNftToList(nft);
    setIsDetailsOpen(false);
    setIsListOpen(true);
  };

  const handleList = async (nftId: string, price: string) => {
    if (!nftToList) throw new Error('No NFT selected for listing');
    await listMutation.mutateAsync({ nftId, price, nft: nftToList });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <User className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
              <p className="text-muted-foreground mb-4">
                Connect your wallet to view your profile and owned NFTs
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <div className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
                  <User className="h-10 w-10 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-2xl font-bold" data-testid="text-profile-title">My Profile</h1>
                    <EncryptionBadge label="Private Identity" />
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    <span className="font-mono text-sm" data-testid="text-wallet-address">
                      {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connected'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">NFTs Owned</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid="text-nfts-owned">
                  {profileData?.stats.nftsOwned || 0}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Trades</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid="text-total-trades">
                  {profileData?.stats.totalTrades || 0}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Total Spent</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold font-mono" data-testid="text-total-spent">
                  {profileData?.stats.totalSpent || '0.00'} ETH
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Total Earned</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold font-mono" data-testid="text-total-earned">
                  {profileData?.stats.totalEarned || '0.00'} ETH
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for NFTs and Activity */}
        <Tabs defaultValue="nfts" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="nfts" data-testid="tab-nfts">
              <Image className="h-4 w-4 mr-2" />
              My NFTs
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nfts">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <Skeleton className="aspect-square" />
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : profileData?.ownedNfts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No NFTs Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    You don't own any NFTs yet. Explore the marketplace to find your first one!
                  </p>
                  <Link href="/">
                    <Button data-testid="button-explore">Explore Marketplace</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <NftGrid 
                nfts={profileData?.ownedNfts || []} 
                isLoading={false}
                onViewDetails={handleViewDetails}
              />
            )}
          </TabsContent>

          <TabsContent value="activity">
            {isLoading ? (
              <Card>
                <CardContent className="p-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-4 border-b last:border-0">
                      <Skeleton className="h-12 w-12 rounded" />
                      <div className="flex-1">
                        <Skeleton className="h-5 w-1/3 mb-2" />
                        <Skeleton className="h-4 w-1/4" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : profileData?.activity.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
                  <p className="text-muted-foreground">
                    Your transaction history will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {profileData?.activity.map((item) => (
                      <div 
                        key={item.id} 
                        className="flex items-center gap-4 p-4 hover-elevate"
                        data-testid={`activity-item-${item.id}`}
                      >
                        <div className="relative">
                          <img 
                            src={item.nftImage} 
                            alt={item.nftName}
                            className="h-12 w-12 rounded object-cover"
                          />
                          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                            {getActivityIcon(item.type)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.nftName}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {getActivityLabel(item)}
                            </Badge>
                            <span>{formatDate(item.timestamp)}</span>
                          </div>
                        </div>
                        {item.price && (
                          <div className="text-right">
                            <p className="font-mono font-semibold">{item.price} ETH</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <NftDetailsModal
        nft={selectedNft}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onBuy={() => {}}
        onList={handleListClick}
        onCancelListing={handleCancelListing}
        isCancelPending={cancelListingMutation.isPending}
      />

      <ListModal
        nft={nftToList}
        isOpen={isListOpen}
        onClose={() => {
          setIsListOpen(false);
          setNftToList(null);
        }}
        onList={handleList}
        isPending={listMutation.isPending}
      />
    </div>
  );
}
