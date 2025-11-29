import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EncryptionBadge } from './encryption-badge';
import { useWallet } from '@/lib/wallet';
import { Eye, EyeOff, Shield } from 'lucide-react';
import type { NftWithListing } from '@shared/schema';

interface NftDetailsModalProps {
  nft: NftWithListing | null;
  isOpen: boolean;
  onClose: () => void;
  onBuy: (nft: NftWithListing) => void;
  onPrivateBuy?: (nft: NftWithListing) => void;
  onList: (nft: NftWithListing) => void;
  onCancelListing?: (nft: NftWithListing) => void;
  isCancelPending?: boolean;
  isBuyPending?: boolean;
  isPrivateBuyPending?: boolean;
}

export function NftDetailsModal({
  nft,
  isOpen,
  onClose,
  onBuy,
  onPrivateBuy,
  onList,
  onCancelListing,
  isCancelPending = false,
  isBuyPending = false,
  isPrivateBuyPending = false,
}: NftDetailsModalProps) {
  const { isConnected, encryptedAddress } = useWallet();

  if (!nft) return null;

  const hasListing = nft.listing && nft.listing.isActive;
  const isOwner = isConnected && nft.encryptedOwner === encryptedAddress;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">
            {nft.name}
          </DialogTitle>
          <DialogDescription>Token ID: #{nft.tokenId}</DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Image */}
          <div className="relative">
            <div className="sticky top-0">
              <img
                src={nft.imageUrl}
                alt={nft.name}
                className="w-full rounded-lg aspect-square object-cover"
                data-testid="img-nft-detail"
              />
            </div>
          </div>

          {/* Right: Details */}
          <div className="space-y-6">
            {/* Description */}
            {nft.description && (
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground">{nft.description}</p>
              </div>
            )}

            <Separator />

            {/* Ownership */}
            <div>
              <h3 className="font-semibold mb-3">Ownership</h3>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">Current Owner</span>
                <EncryptionBadge label="Encrypted Address" />
              </div>
            </div>

            <Separator />

            {/* Price Info */}
            <div>
              <h3 className="font-semibold mb-3">Price Information</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <span className="text-sm">
                    {hasListing ? 'Listed Price' : 'Mint Price'}
                  </span>
                  <span 
                    className="font-mono font-bold text-lg"
                    data-testid="text-detail-price"
                  >
                    {hasListing ? nft.listing.price : nft.mintPrice} ETH
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-3">
              {!isConnected ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Connect your wallet to interact with this NFT
                </p>
              ) : hasListing ? (
                <>
                  {isOwner ? (
                    <div className="space-y-2">
                      <Badge variant="outline" className="w-full justify-center py-2">
                        Listed for {nft.listing.price} ETH
                      </Badge>
                      {onCancelListing && (
                        <Button
                          size="lg"
                          variant="destructive"
                          className="w-full"
                          onClick={() => onCancelListing(nft)}
                          disabled={isCancelPending}
                          data-testid="button-cancel-listing"
                        >
                          {isCancelPending ? 'Canceling...' : 'Cancel Listing'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Private Buy - Recommended for privacy */}
                      {onPrivateBuy && (
                        <div className="space-y-2">
                          <Button
                            size="lg"
                            className="w-full"
                            onClick={() => onPrivateBuy(nft)}
                            disabled={isPrivateBuyPending}
                            data-testid="button-private-buy-nft"
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            {isPrivateBuyPending ? 'Processing...' : `Buy Privately for ${nft.listing.price} ETH`}
                          </Button>
                          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                            <EyeOff className="h-3 w-3" />
                            Your wallet address stays hidden on Etherscan
                          </p>
                        </div>
                      )}
                      
                      {/* Separator */}
                      {onPrivateBuy && (
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">or</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Regular Buy - Exposes wallet */}
                      <div className="space-y-2">
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full"
                          onClick={() => onBuy(nft)}
                          disabled={isBuyPending}
                          data-testid="button-buy-nft"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {isBuyPending ? 'Processing...' : `Buy via Wallet for ${nft.listing.price} ETH`}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                          <Eye className="h-3 w-3" />
                          Your wallet address will be visible on Etherscan
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : isOwner ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={() => onList(nft)}
                  data-testid="button-list-nft"
                >
                  List for Sale
                </Button>
              ) : (
                <Badge variant="secondary" className="w-full justify-center py-2">
                  Not for sale
                </Badge>
              )}
            </div>

            {/* Privacy Notice */}
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground">
                🔒 All trader identities are encrypted using Zama FHE. 
                Only transaction prices are public.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
