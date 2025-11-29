import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { LaunchCollectionModal } from '@/components/launch-collection-modal';
import { CollectionMintModal } from '@/components/collection-mint-modal';
import { 
  Rocket, 
  Package, 
  Coins, 
  Users, 
  Plus,
  Sparkles,
  TrendingUp,
  Link2,
  ExternalLink
} from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  isContractConfigured, 
  isCollectionFactoryConfigured,
  deployCollection,
  getActiveDeployedCollections,
  mintFromCollection,
  getDeploymentFee,
  getCollectionFactoryAddress,
  type DeployedCollection
} from '@/lib/contracts';
import { createEncryptedInput, createEncryptedAddressInput } from '@/lib/fhevm';
import { signMintRequest } from '@/lib/signing';
import { FHEVM_CONFIG } from '@shared/fhevm-config';
import type { Collection } from '@shared/schema';

export default function Collections() {
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [isMintModalOpen, setIsMintModalOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [mintingCollectionId, setMintingCollectionId] = useState<number | null>(null);
  const [deployedCollections, setDeployedCollections] = useState<DeployedCollection[]>([]);
  const [isLoadingDeployed, setIsLoadingDeployed] = useState(false);
  const [deploymentFee, setDeploymentFee] = useState<string>('0.001');
  const { isConnected, address, encryptedAddress } = useWallet();
  const { toast } = useToast();

  const factoryConfigured = isCollectionFactoryConfigured();

  const { data: collections = [], isLoading: isLoadingBackend } = useQuery<Collection[]>({
    queryKey: ['/api/collections'],
  });

  useEffect(() => {
    async function fetchDeployedCollections() {
      if (!factoryConfigured) return;
      
      setIsLoadingDeployed(true);
      try {
        const [deployed, fee] = await Promise.all([
          getActiveDeployedCollections(),
          getDeploymentFee()
        ]);
        setDeployedCollections(deployed);
        setDeploymentFee(fee);
      } catch (error) {
        console.error('Failed to fetch deployed collections:', error);
      } finally {
        setIsLoadingDeployed(false);
      }
    }
    
    fetchDeployedCollections();
  }, [factoryConfigured]);

  const launchMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!address || !encryptedAddress) throw new Error('Wallet not connected');
      
      if (!factoryConfigured) {
        throw new Error('Collection Factory contract not configured. Please deploy the contract first.');
      }

      const factoryAddress = getCollectionFactoryAddress();
      if (!factoryAddress) {
        throw new Error('Collection Factory address not configured');
      }

      // Create a random value for encryption (used as creator identifier)
      const creatorId = BigInt(Math.floor(Math.random() * 1000000000));
      
      // Create proper FHE encrypted input
      const encrypted = await createEncryptedInput(
        factoryAddress,
        address,
        creatorId,
        64
      );
      
      const { collectionId, contractAddress } = await deployCollection(
        data.name,
        data.symbol,
        data.imageUrl,
        parseInt(data.totalSupply),
        data.mintPrice,
        encrypted.handle,
        encrypted.proof
      );

      await apiRequest('POST', '/api/collections', {
        ...data,
        totalSupply: parseInt(data.totalSupply),
        bannerUrl: data.bannerUrl || undefined,
        encryptedCreator: encryptedAddress,
        onChainId: collectionId,
        contractAddress,
      });

      return { collectionId, contractAddress };
    },
    onSuccess: async ({ collectionId, contractAddress }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      
      if (factoryConfigured) {
        try {
          const deployed = await getActiveDeployedCollections();
          setDeployedCollections(deployed);
        } catch (e) {
          console.error('Failed to refresh deployed collections:', e);
        }
      }
      
      toast({
        title: 'Collection Deployed',
        description: `Your NFT collection contract is now live at ${contractAddress.slice(0, 10)}...`,
      });
      setIsLaunchOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Deployment Failed',
        description: error.message || 'Failed to deploy collection contract',
        variant: 'destructive',
      });
    },
  });

  const isLoading = isLoadingBackend || isLoadingDeployed;

  // Only show collections that exist in our database (to filter out old blockchain test collections)
  // Merge blockchain data with database data for complete info
  const displayCollections = collections.map(dbCollection => {
    // Find matching blockchain collection by contract address
    const blockchainCollection = deployedCollections.find(
      c => c.contractAddress.toLowerCase() === dbCollection.contractAddress?.toLowerCase()
    );
    
    // Use blockchain data for real-time minted count, but database for metadata (images, description)
    return {
      ...dbCollection,
      mintedCount: blockchainCollection?.mintedCount ?? dbCollection.mintedCount,
      isSoldOut: blockchainCollection?.isSoldOut ?? (dbCollection.mintedCount >= dbCollection.totalSupply),
    };
  });

  const toHexString = (bytes: Uint8Array): string => {
    return '0x' + Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  const mintFromCollectionMutation = useMutation({
    mutationFn: async ({ collection, usePool, accountHash }: { collection: any; usePool: boolean; accountHash?: string }) => {
      if (!address || !encryptedAddress) throw new Error('Wallet not connected');
      
      if (!collection.contractAddress) {
        throw new Error('Collection contract address not available');
      }

      setMintingCollectionId(collection.onChainId || parseInt(collection.id));

      const tokenNumber = collection.mintedCount + 1;
      const metadataUri = JSON.stringify({
        name: `${collection.name} #${tokenNumber}`,
        description: `NFT #${tokenNumber} from ${collection.name} collection`,
        collection: collection.name,
        symbol: collection.symbol,
      });

      if (usePool && accountHash) {
        // For pool minting, we need to create the encrypted input with the RELAYER's address
        // because the relayer will be the msg.sender calling the contract
        const relayerStatusRes = await fetch('/api/relayer/status');
        const relayerStatus = await relayerStatusRes.json();
        
        if (!relayerStatus.available || !relayerStatus.relayerAddress) {
          throw new Error('Relayer not available for pool minting');
        }
        
        // VeilXCollection contract expects externalEuint64 (64-bit encrypted value)
        // Generate a random owner ID and encrypt it with the relayer's address context
        // (since the relayer is the msg.sender calling the contract)
        const ownerId = BigInt(Math.floor(Math.random() * 1000000000));
        
        const encryptedInput = await createEncryptedInput(
          collection.contractAddress, 
          relayerStatus.relayerAddress,  // Use relayer address for proof validation
          ownerId,
          64  // 64-bit encrypted value to match externalEuint64
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
        const signedRequest = await signMintRequest(signer, collection.id, collection.mintPrice);

        const response = await apiRequest('POST', '/api/collections/pool-mint', {
          collectionId: collection.id,
          collectionAddress: collection.contractAddress,
          tokenUri: metadataUri,
          mintPrice: collection.mintPrice,
          accountHash,
          encryptedOwner: encryptedAddress,
          encryptedHandle: handleHex,
          inputProof: proofHex,
          signedRequest, // EIP-712 signature for authorization
        });
        
        const result = await response.json();
        return { tokenId: result.tokenId, usePool: true };
      }

      const ownerId = BigInt(Math.floor(Math.random() * 1000000000));
      
      const encrypted = await createEncryptedInput(
        collection.contractAddress,
        address,
        ownerId,
        64
      );
      
      const tokenId = await mintFromCollection(
        collection.contractAddress,
        metadataUri,
        collection.mintPrice,
        encrypted.handle,
        encrypted.proof
      );

      await apiRequest('POST', `/api/collections/${collection.id}/mint`, {
        encryptedOwner: encryptedAddress,
        tokenId,
        onChain: true,
      });

      return { tokenId, usePool: false };
    },
    onSuccess: async ({ tokenId, usePool }) => {
      setMintingCollectionId(null);
      setIsMintModalOpen(false);
      setSelectedCollection(null);
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/nfts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      if (usePool) {
        queryClient.invalidateQueries({ queryKey: ['/api/pool/balance'] });
      }
      
      if (factoryConfigured) {
        try {
          const deployed = await getActiveDeployedCollections();
          setDeployedCollections(deployed);
        } catch (e) {
          console.error('Failed to refresh deployed collections:', e);
        }
      }
      
      toast({
        title: usePool ? 'NFT Minted Anonymously' : 'NFT Minted',
        description: usePool 
          ? `Token #${tokenId} minted using Privacy Pool - fully anonymous!`
          : `Successfully minted token #${tokenId}!`,
      });
    },
    onError: (error: any) => {
      setMintingCollectionId(null);
      toast({
        title: 'Mint Failed',
        description: error.message || 'Failed to mint NFT',
        variant: 'destructive',
      });
    },
  });

  const handleMintClick = (collection: any) => {
    if (!isConnected) {
      toast({
        title: 'Connect Wallet',
        description: 'Please connect your wallet to mint',
        variant: 'destructive',
      });
      return;
    }
    setSelectedCollection(collection);
    setIsMintModalOpen(true);
  };

  const handleMintFromModal = async (usePool: boolean, accountHash?: string) => {
    if (!selectedCollection) return;
    await mintFromCollectionMutation.mutateAsync({ 
      collection: selectedCollection, 
      usePool, 
      accountHash 
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video" />
                <CardContent className="p-4 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Rocket className="h-8 w-8 text-primary" />
              NFT Collections
            </h1>
            <p className="text-muted-foreground mt-1">
              Deploy your own NFT collection with encrypted creator identity
            </p>
            {factoryConfigured && (
              <p className="text-sm text-muted-foreground mt-1">
                Deployment fee: {deploymentFee} ETH
              </p>
            )}
          </div>
          {isConnected && (
            <Button 
              onClick={() => setIsLaunchOpen(true)} 
              disabled={!factoryConfigured}
              data-testid="button-launch-collection"
            >
              <Plus className="mr-2 h-4 w-4" />
              Deploy Collection
            </Button>
          )}
        </div>

        {!factoryConfigured && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <Link2 className="h-5 w-5" />
              <span className="font-medium">Collection Factory not deployed</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Deploy the CollectionFactory contract and set VITE_COLLECTION_FACTORY_ADDRESS to enable on-chain collection deployment.
            </p>
          </div>
        )}

        {displayCollections.length === 0 ? (
          <Card className="p-16">
            <div className="text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-2xl font-semibold mb-2">No Collections Yet</h3>
              <p className="text-muted-foreground mb-6">
                Be the first to deploy an NFT collection on VeilX
              </p>
              {isConnected && factoryConfigured && (
                <Button onClick={() => setIsLaunchOpen(true)} data-testid="button-launch-first">
                  <Plus className="mr-2 h-4 w-4" />
                  Deploy Your Collection
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayCollections.map((collection: any) => {
              const progress = (collection.mintedCount / collection.totalSupply) * 100;
              const isSoldOut = collection.isSoldOut || collection.mintedCount >= collection.totalSupply;
              
              return (
                <Card 
                  key={collection.id} 
                  className="overflow-hidden hover-elevate"
                  data-testid={`card-collection-${collection.id}`}
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
                        <Package className="h-16 w-16 text-primary/40" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {collection.contractAddress && (
                        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
                          <Link2 className="mr-1 h-3 w-3" />
                          Deployed
                        </Badge>
                      )}
                    </div>
                    <div className="absolute top-3 right-3">
                      {isSoldOut ? (
                        <Badge variant="secondary">Sold Out</Badge>
                      ) : (
                        <Badge variant="default">
                          <TrendingUp className="mr-1 h-3 w-3" />
                          Live
                        </Badge>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-lg truncate" data-testid={`text-collection-name-${collection.id}`}>
                          {collection.name}
                        </h3>
                        <Badge variant="outline">{collection.symbol}</Badge>
                      </div>
                      {collection.contractAddress && (
                        <a 
                          href={`${FHEVM_CONFIG.blockExplorer}/address/${collection.contractAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          {collection.contractAddress.slice(0, 10)}...{collection.contractAddress.slice(-8)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Minted</span>
                        <span className="font-medium">
                          {collection.mintedCount} / {collection.totalSupply}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Mint Price</p>
                          <p className="font-medium" data-testid={`text-mint-price-${collection.id}`}>
                            {collection.mintPrice} ETH
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Remaining</p>
                          <p className="font-medium">
                            {collection.totalSupply - collection.mintedCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 pt-0">
                    <Button
                      className="w-full"
                      disabled={isSoldOut || !isConnected || !collection.contractAddress || mintFromCollectionMutation.isPending}
                      onClick={() => handleMintClick(collection)}
                      data-testid={`button-mint-${collection.id}`}
                    >
                      {isSoldOut ? (
                        'Sold Out'
                      ) : !collection.contractAddress ? (
                        'Not Deployed'
                      ) : mintingCollectionId === (collection.onChainId || parseInt(collection.id)) ? (
                        'Confirming Transaction...'
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Mint for {collection.mintPrice} ETH
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <LaunchCollectionModal
        open={isLaunchOpen}
        onOpenChange={setIsLaunchOpen}
        onSubmit={(data) => launchMutation.mutate(data)}
        isLoading={launchMutation.isPending}
      />

      <CollectionMintModal
        isOpen={isMintModalOpen}
        onClose={() => {
          setIsMintModalOpen(false);
          setSelectedCollection(null);
        }}
        collection={selectedCollection}
        onMint={handleMintFromModal}
        isPending={mintFromCollectionMutation.isPending}
      />
    </div>
  );
}
