import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, Lock, Info, Sparkles, Package, Coins } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';

interface CollectionMintModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: {
    id: string;
    name: string;
    symbol: string;
    mintPrice: string;
    imageUrl?: string;
    contractAddress?: string;
    mintedCount: number;
    totalSupply: number;
  } | null;
  onMint: (usePool: boolean, accountHash?: string) => Promise<void>;
  isPending: boolean;
}

interface PoolBalance {
  accountHash: string;
  balance: string;
  totalDeposited: string;
  totalSpent: string;
}

interface PoolStatus {
  available: boolean;
  contractAddress?: string;
}

export function CollectionMintModal({ isOpen, onClose, collection, onMint, isPending }: CollectionMintModalProps) {
  const { address, isConnected } = useWallet();
  const [usePool, setUsePool] = useState(false);
  const [accountHash, setAccountHash] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
      setAccountHash(hash);
    }
  }, [address]);

  const { data: poolStatus } = useQuery<PoolStatus>({
    queryKey: ['/api/pool/status'],
    enabled: isOpen,
  });

  const { data: poolBalance } = useQuery<PoolBalance>({
    queryKey: ['/api/pool/balance', accountHash],
    enabled: isOpen && !!accountHash && usePool,
  });

  const mintPrice = parseFloat(collection?.mintPrice || '0');
  const poolBalanceNum = parseFloat(poolBalance?.balance || '0');
  const hasInsufficientPoolBalance = usePool && poolBalanceNum < mintPrice;

  const handleMint = async () => {
    await onMint(usePool, usePool ? accountHash || undefined : undefined);
  };

  if (!collection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Mint from Collection
          </DialogTitle>
          <DialogDescription>
            Mint an NFT from {collection.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                {collection.imageUrl ? (
                  <img src={collection.imageUrl} alt={collection.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 text-primary/40" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{collection.name}</h3>
                  <Badge variant="outline">{collection.symbol}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  #{collection.mintedCount + 1} of {collection.totalSupply}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Mint Price</span>
              </div>
              <span className="font-mono font-bold">{collection.mintPrice} ETH</span>
            </div>
          </div>

          {poolStatus?.available && isConnected && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <Label htmlFor="use-pool-collection" className="font-medium">
                    Use Privacy Pool
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    Max Privacy
                  </Badge>
                </div>
                <Switch
                  id="use-pool-collection"
                  checked={usePool}
                  onCheckedChange={setUsePool}
                  data-testid="switch-use-pool-collection"
                />
              </div>
              
              {usePool && (
                <div className="pt-2 border-t border-border/50 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pool Balance:</span>
                    <span className="font-mono font-medium" data-testid="text-collection-pool-balance">
                      {poolBalanceNum.toFixed(4)} ETH
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mint Cost:</span>
                    <span className="font-mono font-medium" data-testid="text-collection-mint-cost">
                      {mintPrice.toFixed(4)} ETH
                    </span>
                  </div>
                  {hasInsufficientPoolBalance && (
                    <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-collection-insufficient-balance">
                      <Info className="h-3 w-3" />
                      Insufficient pool balance. Deposit more ETH first.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={`p-3 rounded-lg border ${usePool ? 'bg-primary/10 border-primary/30' : 'bg-primary/5 border-primary/20'}`}>
            <div className="flex gap-2">
              <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary mb-1">
                  {usePool ? 'Maximum Privacy Mode' : 'Private Minting Enabled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {usePool ? (
                    <>
                      Payment comes from the Privacy Pool. On Etherscan, there's <strong>no link</strong> between 
                      your wallet and this mint transaction.
                    </>
                  ) : (
                    <>
                      Your transaction will be submitted through your wallet.
                      Your ownership is encrypted with FHE.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isPending}
              data-testid="button-cancel-collection-mint"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMint}
              className="flex-1"
              disabled={isPending || !isConnected || (usePool && hasInsufficientPoolBalance)}
              data-testid="button-submit-collection-mint"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : (
                <>
                  {usePool && <Shield className="mr-2 h-4 w-4" />}
                  Mint for {collection.mintPrice} ETH
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
