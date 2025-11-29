import { NftCard } from './nft-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { PackageOpen, Search } from 'lucide-react';
import type { NftWithListing } from '@shared/schema';

interface NftGridProps {
  nfts: NftWithListing[];
  isLoading: boolean;
  onViewDetails: (nft: NftWithListing) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  isFiltered?: boolean;
}

export function NftGrid({ 
  nfts, 
  isLoading, 
  onViewDetails, 
  emptyMessage,
  emptyDescription,
  isFiltered = false
}: NftGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <Skeleton className="aspect-square w-full" />
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (nfts.length === 0) {
    const Icon = isFiltered ? Search : PackageOpen;
    return (
      <Card className="p-16">
        <div className="text-center">
          <Icon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-2xl font-semibold mb-2">
            {emptyMessage || (isFiltered ? 'No Results Found' : 'No NFTs Available')}
          </h3>
          <p className="text-muted-foreground mb-6">
            {emptyDescription || (isFiltered 
              ? 'Try adjusting your search or filter criteria'
              : 'Be the first to mint an NFT in this collection'
            )}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {nfts.map((nft) => (
        <NftCard key={nft.id} nft={nft} onViewDetails={onViewDetails} />
      ))}
    </div>
  );
}
