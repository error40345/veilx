import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NftWithListing } from '@shared/schema';

interface OfferModalProps {
  nft: NftWithListing | null;
  isOpen: boolean;
  onClose: () => void;
  onMakeOffer: (nftId: string, amount: string) => Promise<void>;
  isPending: boolean;
}

export function OfferModal({
  nft,
  isOpen,
  onClose,
  onMakeOffer,
  isPending,
}: OfferModalProps) {
  const [amount, setAmount] = useState('');

  // Reset form state when modal closes or nft changes
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
    }
  }, [isOpen]);

  if (!nft) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    await onMakeOffer(nft.id, amount);
  };

  const handleClose = () => {
    setAmount('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Make an offer for {nft.name}. Your offer will be stored on-chain.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
              <img
                src={nft.imageUrl}
                alt={nft.name}
                className="h-16 w-16 rounded object-cover"
                data-testid="img-offer-nft"
              />
              <div>
                <p className="font-medium" data-testid="text-offer-nft-name">{nft.name}</p>
                <p className="text-sm text-muted-foreground" data-testid="text-offer-nft-price">
                  {nft.listing?.price ? `Listed at ${nft.listing.price} ETH` : 'Not listed'}
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="offer-amount">Your Offer (ETH)</Label>
              <Input
                id="offer-amount"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-offer-amount"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              data-testid="button-cancel-offer"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isPending || !amount || parseFloat(amount) <= 0}
              data-testid="button-submit-offer"
            >
              {isPending ? 'Processing...' : 'Make Offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
