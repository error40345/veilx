import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2, Shield, Wallet, Lock, Info } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';

const mintSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  mintPrice: z.string().min(1, 'Price is required').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    'Price must be a positive number'
  ),
  imageUrl: z.string().url('Must be a valid URL'),
});

type MintFormData = z.infer<typeof mintSchema>;

interface MintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMint: (data: MintFormData & { usePool?: boolean; accountHash?: string }) => Promise<void>;
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

export function MintModal({ isOpen, onClose, onMint, isPending }: MintModalProps) {
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

  const form = useForm<MintFormData>({
    resolver: zodResolver(mintSchema),
    defaultValues: {
      name: '',
      description: '',
      mintPrice: '0.1',
      imageUrl: '',
    },
  });

  const mintPrice = parseFloat(form.watch('mintPrice') || '0');
  const poolBalanceNum = parseFloat(poolBalance?.balance || '0');
  const hasInsufficientPoolBalance = usePool && poolBalanceNum < mintPrice;

  const handleSubmit = async (data: MintFormData) => {
    await onMint({
      ...data,
      usePool,
      accountHash: usePool ? accountHash || undefined : undefined,
    });
    form.reset();
    setUsePool(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Mint NFT</DialogTitle>
          <DialogDescription>
            Create a new NFT with encrypted ownership
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NFT Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="My Awesome NFT"
                      {...field}
                      data-testid="input-nft-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your NFT..."
                      {...field}
                      data-testid="input-nft-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      {...field}
                      data-testid="input-nft-image"
                    />
                  </FormControl>
                  <FormMessage />
                  {field.value && (
                    <div className="mt-2 relative aspect-square w-full max-w-[200px] rounded-lg overflow-hidden border bg-muted" data-testid="preview-nft-image">
                      <img
                        src={field.value}
                        alt="NFT Preview"
                        className="w-full h-full object-cover"
                        data-testid="img-nft-preview"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        onLoad={(e) => {
                          (e.target as HTMLImageElement).style.display = 'block';
                        }}
                      />
                    </div>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mintPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mint Price (ETH)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="0.1"
                      {...field}
                      data-testid="input-mint-price"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pool Minting Toggle */}
            {poolStatus?.available && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <Label htmlFor="use-pool" className="font-medium">
                      Use Privacy Pool
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      Max Privacy
                    </Badge>
                  </div>
                  <Switch
                    id="use-pool"
                    checked={usePool}
                    onCheckedChange={setUsePool}
                    data-testid="switch-use-pool"
                  />
                </div>
                
                {usePool && (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Pool Balance:</span>
                      <span className="font-mono font-medium" data-testid="text-pool-balance">
                        {poolBalanceNum.toFixed(4)} ETH
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Mint Cost:</span>
                      <span className="font-mono font-medium" data-testid="text-mint-cost">
                        {mintPrice.toFixed(4)} ETH
                      </span>
                    </div>
                    {hasInsufficientPoolBalance && (
                      <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-insufficient-balance">
                        <Info className="h-3 w-3" />
                        Insufficient pool balance. Deposit more ETH first.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Privacy Info Box */}
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
                        Your transaction will be submitted through a relayer. 
                        Your wallet is hidden, but the relayer's payment is visible.
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
                data-testid="button-cancel-mint"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending || (usePool && hasInsufficientPoolBalance)}
                data-testid="button-submit-mint"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Minting...
                  </>
                ) : (
                  <>
                    {usePool && <Shield className="mr-2 h-4 w-4" />}
                    Mint NFT
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
