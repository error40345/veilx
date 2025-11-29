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
  FormDescription,
} from '@/components/ui/form';
import { Loader2, Rocket, Image, Hash, Coins, Package } from 'lucide-react';

const launchCollectionSchema = z.object({
  name: z.string().min(1, 'Collection name is required').max(100),
  symbol: z.string().min(1, 'Symbol is required').max(10).toUpperCase(),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url('Must be a valid URL'),
  bannerUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  totalSupply: z.string().min(1, 'Total supply is required').refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) <= 10000,
    'Supply must be between 1 and 10,000'
  ),
  mintPrice: z.string().min(1, 'Mint price is required').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    'Price must be a non-negative number'
  ),
});

type LaunchCollectionFormData = z.infer<typeof launchCollectionSchema>;

interface LaunchCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: LaunchCollectionFormData) => void;
  isLoading: boolean;
}

export function LaunchCollectionModal({ open, onOpenChange, onSubmit, isLoading }: LaunchCollectionModalProps) {
  const form = useForm<LaunchCollectionFormData>({
    resolver: zodResolver(launchCollectionSchema),
    defaultValues: {
      name: '',
      symbol: '',
      description: '',
      imageUrl: '',
      bannerUrl: '',
      totalSupply: '100',
      mintPrice: '0.05',
    },
  });

  const handleSubmit = (data: LaunchCollectionFormData) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            Launch Collection
          </DialogTitle>
          <DialogDescription>
            Create a new NFT collection with encrypted creator identity
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Collection Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="My Awesome Collection"
                        {...field}
                        data-testid="input-collection-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem className="col-span-2 sm:col-span-1">
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="MAC"
                          className="pl-9 uppercase"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          data-testid="input-collection-symbol"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your collection..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="input-collection-description"
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
                  <FormLabel className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Collection Image URL
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      {...field}
                      data-testid="input-collection-image"
                    />
                  </FormControl>
                  <FormDescription>
                    This image will be used for all minted NFTs
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bannerUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Banner Image URL (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://..."
                      {...field}
                      data-testid="input-collection-banner"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="totalSupply"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Total Supply
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="10000"
                        placeholder="100"
                        {...field}
                        data-testid="input-total-supply"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mintPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Coins className="h-4 w-4" />
                      Mint Price (ETH)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.05"
                        {...field}
                        data-testid="input-collection-mint-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Your creator address will be encrypted using FHE technology. 
                Only the collection details and mint price will be public.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                disabled={isLoading}
                data-testid="button-cancel-launch"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading}
                data-testid="button-submit-launch"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Launch Collection
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
