import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Loader2 } from 'lucide-react';
import type { NftWithListing } from '@shared/schema';

const listSchema = z.object({
  price: z.string().min(1, 'Price is required').refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    'Price must be a positive number'
  ),
});

type ListFormData = z.infer<typeof listSchema>;

interface ListModalProps {
  nft: NftWithListing | null;
  isOpen: boolean;
  onClose: () => void;
  onList: (nftId: string, price: string) => Promise<void>;
  isPending: boolean;
}

export function ListModal({ nft, isOpen, onClose, onList, isPending }: ListModalProps) {
  const form = useForm<ListFormData>({
    resolver: zodResolver(listSchema),
    defaultValues: {
      price: '',
    },
  });

  const handleSubmit = async (data: ListFormData) => {
    if (!nft) return;
    await onList(nft.id, data.price);
    form.reset();
  };

  if (!nft) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">List NFT for Sale</DialogTitle>
          <DialogDescription>
            Set a price for {nft.name}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <img
            src={nft.imageUrl}
            alt={nft.name}
            className="w-full rounded-lg aspect-square object-cover"
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Listing Price (ETH)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder="0.5"
                      {...field}
                      data-testid="input-list-price"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground">
                🔒 Your identity remains encrypted. Only the listing price is public.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isPending}
                data-testid="button-cancel-list"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
                data-testid="button-submit-list"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Listing...
                  </>
                ) : (
                  'List NFT'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
