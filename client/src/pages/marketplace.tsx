import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { HeroSection } from '@/components/hero-section';
import { MarketStatsSection } from '@/components/market-stats';
import { NftGrid } from '@/components/nft-grid';
import { NftDetailsModal } from '@/components/nft-details-modal';
import { MintModal } from '@/components/mint-modal';
import { ListModal } from '@/components/list-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Plus, Search, SlidersHorizontal, X, Sparkles, TrendingUp, Package, Coins, ArrowRight } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { createEncryptedAddressInput } from '@/lib/fhevm';
import { getContractAddresses } from '@shared/fhevm-config';
import { listNFTInCollection, buyNFTFromCollection } from '@/lib/contracts';
import { signBuyRequest } from '@/lib/signing';
import { Link } from 'wouter';
import type { NftWithListing, MarketStats, Collection } from '@shared/schema';

export default function Marketplace() {
  const [selectedNft, setSelectedNft] = useState<NftWithListing | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMintOpen, setIsMintOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [nftToList, setNftToList] = useState<NftWithListing | null>(null);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'listed' | 'unlisted'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'price_low' | 'price_high'>('newest');
  
  const { isConnected, encryptedAddress, address } = useWallet();
  const { toast } = useToast();

  // Fetch NFTs
  const { data: nfts = [], isLoading: nftsLoading } = useQuery<NftWithListing[]>({
    queryKey: ['/api/nfts'],
  });

  // Fetch Market Stats
  const { data: stats, isLoading: statsLoading } = useQuery<MarketStats>({
    queryKey: ['/api/stats'],
  });

  // Fetch Collections
  const { data: collections = [], isLoading: collectionsLoading } = useQuery<Collection[]>({
    queryKey: ['/api/collections'],
  });

  // Ongoing Mints - active collections that aren't sold out
  const ongoingMints = useMemo(() => {
    return collections
      .filter(c => c.isActive && c.mintedCount < c.totalSupply)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
  }, [collections]);

  // Top Trading Collections - by minted count (as proxy for popularity)
  const topTradingCollections = useMemo(() => {
    return [...collections]
      .sort((a, b) => b.mintedCount - a.mintedCount)
      .slice(0, 4);
  }, [collections]);

  // Filter and sort NFTs
  const filteredNfts = useMemo(() => {
    let result = [...nfts];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        nft => nft.name.toLowerCase().includes(query) ||
               (nft.description && nft.description.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter === 'listed') {
      result = result.filter(nft => nft.listing?.isActive);
    } else if (statusFilter === 'unlisted') {
      result = result.filter(nft => !nft.listing?.isActive);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'price_low':
          const priceALow = parseFloat(a.listing?.price || a.mintPrice);
          const priceBLow = parseFloat(b.listing?.price || b.mintPrice);
          return priceALow - priceBLow;
        case 'price_high':
          const priceAHigh = parseFloat(a.listing?.price || a.mintPrice);
          const priceBHigh = parseFloat(b.listing?.price || b.mintPrice);
          return priceBHigh - priceAHigh;
        default:
          return 0;
      }
    });

    return result;
  }, [nfts, searchQuery, statusFilter, sortBy]);

  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== 'all' || sortBy !== 'newest';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSortBy('newest');
  };

  // Mint Mutation - uses private relayer or pool for hidden minting
  const mintMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      
      const addresses = getContractAddresses();
      if (!addresses.nft) throw new Error('NFT contract not configured');
      
      const toHexString = (bytes: Uint8Array): string => {
        return '0x' + Array.from(bytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      
      const encryptedInput = await createEncryptedAddressInput(addresses.nft, address);
      
      const handleHex = encryptedInput.handle instanceof Uint8Array 
        ? toHexString(encryptedInput.handle)
        : encryptedInput.handle;
      
      const proofHex = encryptedInput.proof instanceof Uint8Array
        ? toHexString(encryptedInput.proof)
        : encryptedInput.proof;
      
      // Use pool minting if requested
      if (data.usePool && data.accountHash) {
        return apiRequest('POST', '/api/pool/mint', {
          name: data.name,
          description: data.description,
          imageUrl: data.imageUrl,
          mintPrice: data.mintPrice,
          accountHash: data.accountHash,
          encryptedOwner: encryptedAddress,
          encryptedHandle: handleHex,
          inputProof: proofHex,
        });
      }
      
      // Regular private minting via relayer
      return apiRequest('POST', '/api/mint/private', {
        ...data,
        encryptedOwner: encryptedAddress,
        encryptedHandle: handleHex,
        inputProof: proofHex,
      });
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      if (variables.usePool) {
        queryClient.invalidateQueries({ queryKey: ['/api/pool/balance'] });
      }
      toast({
        title: variables.usePool ? 'NFT Minted Anonymously' : 'NFT Minted Privately',
        description: variables.usePool 
          ? 'Your NFT was minted using the Privacy Pool - fully anonymous on Etherscan'
          : 'Your NFT was minted via relayer - your wallet is hidden from the blockchain',
      });
      setIsMintOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Minting Failed',
        description: error.message || 'Failed to mint NFT',
        variant: 'destructive',
      });
    },
  });

  // List Mutation - calls blockchain listNFT function via MetaMask
  const listMutation = useMutation({
    mutationFn: async ({ nftId, price, nft }: { nftId: string; price: string; nft: NftWithListing }) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      
      // Get the collection to find the contract address
      const collection = collections.find(c => c.id === nft.collectionId);
      if (!collection?.contractAddress) {
        throw new Error('Collection contract address not found');
      }
      
      // Create encrypted input for the seller
      const encryptedInput = await createEncryptedAddressInput(collection.contractAddress, address);
      
      const toHexString = (bytes: Uint8Array): string => {
        return '0x' + Array.from(bytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      
      const handleHex = encryptedInput.handle instanceof Uint8Array 
        ? toHexString(encryptedInput.handle)
        : encryptedInput.handle;
      
      const proofHex = encryptedInput.proof instanceof Uint8Array
        ? toHexString(encryptedInput.proof)
        : encryptedInput.proof;
      
      // Call the blockchain function - this triggers MetaMask
      await listNFTInCollection(
        collection.contractAddress,
        nft.tokenId,
        price,
        handleHex,
        proofHex
      );
      
      // After blockchain success, update the database
      return apiRequest('POST', '/api/listings', {
        nftId,
        price,
        encryptedSeller: encryptedAddress,
      });
    },
    onSuccess: () => {
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

  // Buy Mutation - calls blockchain buyNFT function via MetaMask with ETH payment
  // Note: This exposes buyer's wallet address on Etherscan
  const buyMutation = useMutation({
    mutationFn: async (nft: NftWithListing) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      if (!nft.listing) throw new Error('NFT not listed for sale');
      
      // Get the collection to find the contract address
      const collection = collections.find(c => c.id === nft.collectionId);
      if (!collection?.contractAddress) {
        throw new Error('Collection contract address not found');
      }
      
      // Create encrypted input for the buyer
      const encryptedInput = await createEncryptedAddressInput(collection.contractAddress, address);
      
      const toHexString = (bytes: Uint8Array): string => {
        return '0x' + Array.from(bytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      
      const handleHex = encryptedInput.handle instanceof Uint8Array 
        ? toHexString(encryptedInput.handle)
        : encryptedInput.handle;
      
      const proofHex = encryptedInput.proof instanceof Uint8Array
        ? toHexString(encryptedInput.proof)
        : encryptedInput.proof;
      
      // Call the blockchain function - this triggers MetaMask with ETH payment
      await buyNFTFromCollection(
        collection.contractAddress,
        nft.tokenId,
        nft.listing.price,
        handleHex,
        proofHex
      );
      
      // After blockchain success, update the database
      return apiRequest('POST', '/api/buy', {
        nftId: nft.id,
        listingId: nft.listing.id,
        encryptedBuyer: encryptedAddress,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: 'Purchase Successful',
        description: 'NFT purchased on blockchain! Ownership transferred with encrypted identity',
      });
      setIsDetailsOpen(false);
      setSelectedNft(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Failed to buy NFT on blockchain',
        variant: 'destructive',
      });
    },
  });

  // Private Buy Mutation - routes purchase through relayer to hide buyer's wallet
  // Uses pool balances: buyer pays from pool, seller receives to pool
  // SECURED: Requires wallet signature for authorization
  const privateBuyMutation = useMutation({
    mutationFn: async (nft: NftWithListing) => {
      if (!encryptedAddress || !address) throw new Error('Wallet not connected');
      if (!nft.listing) throw new Error('NFT not listed for sale');
      
      // Generate accountHash for pool balance lookup
      const accountHash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
      
      // Get signer from wallet for EIP-712 signing
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Request wallet signature for authorization
      const signedRequest = await signBuyRequest(signer, nft.id, nft.listing.price);
      
      // Use the private buy endpoint - server handles FHEVM encryption with relayer wallet
      // This ensures the encrypted input is created for the relayer (tx sender), not the buyer
      // Payment is deducted from buyer's pool and credited to seller's pool
      return apiRequest('POST', '/api/buy/private', {
        nftId: nft.id,
        encryptedBuyer: encryptedAddress,
        buyerAddress: address,
        accountHash, // Required for pool-based payment
        signedRequest, // EIP-712 signature for authorization
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pool/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: 'Private Purchase Successful',
        description: 'NFT purchased anonymously! Payment processed through privacy pool.',
      });
      setIsDetailsOpen(false);
      setSelectedNft(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Private Purchase Failed',
        description: error.message || 'Failed to buy NFT privately. Make sure you have funds in your privacy pool.',
        variant: 'destructive',
      });
    },
  });

  const handleViewDetails = (nft: NftWithListing) => {
    setSelectedNft(nft);
    setIsDetailsOpen(true);
  };

  const handleBuy = (nft: NftWithListing) => {
    buyMutation.mutate(nft);
  };

  const handlePrivateBuy = (nft: NftWithListing) => {
    privateBuyMutation.mutate(nft);
  };

  const handleListClick = (nft: NftWithListing) => {
    setNftToList(nft);
    setIsDetailsOpen(false);
    setIsListOpen(true);
  };

  const handleList = async (nftId: string, price: string) => {
    if (!nftToList) throw new Error('No NFT selected');
    await listMutation.mutateAsync({ nftId, price, nft: nftToList });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <HeroSection />

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header with Mint Button */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-display font-bold mb-2">
              Marketplace
            </h2>
            <p className="text-muted-foreground">
              Explore encrypted NFTs with public pricing
            </p>
          </div>
          
          {isConnected && (
            <Button 
              onClick={() => setIsMintOpen(true)}
              size="lg"
              data-testid="button-mint-nft"
            >
              <Plus className="mr-2 h-5 w-5" />
              Mint NFT
            </Button>
          )}
        </div>

        {/* Market Stats */}
        <div id="marketplace" className="mb-12">
          <h3 className="text-xl font-semibold mb-6">Market Overview</h3>
          <MarketStatsSection stats={stats} isLoading={statsLoading} />
        </div>

        {/* Ongoing Mints Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ongoing Mints
            </h3>
            <Link href="/collections">
              <Button variant="ghost" size="sm" data-testid="button-view-all-mints">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          {collectionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video" />
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : ongoingMints.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {ongoingMints.map((collection) => {
                const progress = (collection.mintedCount / collection.totalSupply) * 100;
                return (
                  <Card 
                    key={collection.id} 
                    className="overflow-hidden hover-elevate"
                    data-testid={`card-ongoing-mint-${collection.id}`}
                  >
                    <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                      {collection.imageUrl ? (
                        <img
                          src={collection.bannerUrl || collection.imageUrl}
                          alt={collection.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-primary/40" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="bg-green-600">
                          <Sparkles className="mr-1 h-3 w-3" />
                          Live
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold truncate">{collection.name}</h4>
                        <Badge variant="outline">{collection.symbol}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Minted</span>
                          <span className="font-medium">{collection.mintedCount} / {collection.totalSupply}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Coins className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{collection.mintPrice} ETH</span>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 pt-0">
                      <Link href="/collections" className="w-full">
                        <Button 
                          className="w-full" 
                          size="sm"
                          data-testid={`button-mint-ongoing-${collection.id}`}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Mint Now
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-8">
              <div className="text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">No active mints at the moment</p>
                <Link href="/collections">
                  <Button variant="outline" className="mt-4" data-testid="button-explore-collections">
                    Explore Collections
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Top Trading Collections Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top Trading Collections
            </h3>
            <Link href="/collections">
              <Button variant="ghost" size="sm" data-testid="button-view-all-collections">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          {collectionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video" />
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : topTradingCollections.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {topTradingCollections.map((collection, index) => {
                const progress = (collection.mintedCount / collection.totalSupply) * 100;
                const isSoldOut = collection.mintedCount >= collection.totalSupply;
                return (
                  <Card 
                    key={collection.id} 
                    className="overflow-hidden hover-elevate"
                    data-testid={`card-top-collection-${collection.id}`}
                  >
                    <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                      {collection.imageUrl ? (
                        <img
                          src={collection.bannerUrl || collection.imageUrl}
                          alt={collection.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-primary/40" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="font-bold">
                          #{index + 1}
                        </Badge>
                      </div>
                      {isSoldOut && (
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary">Sold Out</Badge>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold truncate">{collection.name}</h4>
                        <Badge variant="outline">{collection.symbol}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Minted</span>
                          <span className="font-medium">{collection.mintedCount}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                          <span>{collection.mintPrice} ETH</span>
                        </div>
                        <span className="text-muted-foreground">
                          {collection.totalSupply - collection.mintedCount} left
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-8">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">No collections to display yet</p>
                <Link href="/collections">
                  <Button variant="outline" className="mt-4" data-testid="button-deploy-collection">
                    Deploy First Collection
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* NFT Grid with Search and Filters */}
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-xl font-semibold">All NFTs</h3>
            
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Search Input */}
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search NFTs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-full sm:w-32" data-testid="select-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="listed">For Sale</SelectItem>
                  <SelectItem value="unlisted">Not Listed</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-full sm:w-40" data-testid="select-sort">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="price_low">Price: Low to High</SelectItem>
                  <SelectItem value="price_high">Price: High to Low</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Results count */}
          {!nftsLoading && (
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-results-count">
              {filteredNfts.length} {filteredNfts.length === 1 ? 'NFT' : 'NFTs'} found
              {hasActiveFilters && ` (filtered from ${nfts.length})`}
            </p>
          )}

          <NftGrid
            nfts={filteredNfts}
            isLoading={nftsLoading}
            onViewDetails={handleViewDetails}
            isFiltered={hasActiveFilters}
          />
        </div>
      </div>

      {/* Modals */}
      <NftDetailsModal
        nft={selectedNft}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onBuy={handleBuy}
        onPrivateBuy={handlePrivateBuy}
        onList={handleListClick}
        isBuyPending={buyMutation.isPending}
        isPrivateBuyPending={privateBuyMutation.isPending}
      />

      <MintModal
        isOpen={isMintOpen}
        onClose={() => setIsMintOpen(false)}
        onMint={async (data) => { await mintMutation.mutateAsync(data); }}
        isPending={mintMutation.isPending}
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
