import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EncryptionBadge } from './encryption-badge';
import type { NftWithListing } from '@shared/schema';

interface NftCardProps {
  nft: NftWithListing;
  onViewDetails: (nft: NftWithListing) => void;
}

export function NftCard({ nft, onViewDetails }: NftCardProps) {
  const hasListing = nft.listing && nft.listing.isActive;

  return (
    <Card 
      className="overflow-hidden hover-elevate cursor-pointer group"
      onClick={() => onViewDetails(nft)}
      data-testid={`card-nft-${nft.tokenId}`}
    >
      {/* NFT Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={nft.imageUrl}
          alt={nft.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {hasListing && (
          <div className="absolute top-3 right-3">
            <Badge variant="default" className="bg-primary/90 backdrop-blur-sm">
              For Sale
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-4">
        {/* NFT Name with Token ID */}
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold text-lg truncate" data-testid={`text-nft-name-${nft.tokenId}`}>
            {nft.name}
          </h3>
          <Badge variant="outline" className="shrink-0 text-xs font-mono" data-testid={`text-token-id-${nft.tokenId}`}>
            #{nft.tokenId}
          </Badge>
        </div>

        {/* Description */}
        {nft.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {nft.description}
          </p>
        )}

        {/* Encrypted Owner */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Owner</span>
          <EncryptionBadge label="Private" />
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {hasListing ? 'Price' : 'Mint Price'}
          </span>
          <span 
            className="font-mono font-semibold"
            data-testid={`text-price-${nft.tokenId}`}
          >
            {hasListing ? nft.listing.price : nft.mintPrice} ETH
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button 
          variant={hasListing ? 'default' : 'outline'} 
          className="w-full"
          data-testid={`button-view-${nft.tokenId}`}
        >
          {hasListing ? 'Buy Now' : 'View Details'}
        </Button>
      </CardFooter>
    </Card>
  );
}
