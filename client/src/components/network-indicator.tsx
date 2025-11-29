import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network, AlertCircle } from 'lucide-react';
import { useWallet } from '@/lib/wallet';

export function NetworkIndicator() {
  const { isConnected, isSepoliaNetwork, switchToSepoliaNetwork } = useWallet();

  if (!isConnected) {
    return null;
  }

  if (isSepoliaNetwork) {
    return (
      <Badge variant="default" className="gap-1" data-testid="badge-network-status">
        <Network className="h-3 w-3" />
        <span className="hidden sm:inline">Sepolia</span>
      </Badge>
    );
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={switchToSepoliaNetwork}
      className="gap-1"
      data-testid="button-switch-network"
    >
      <AlertCircle className="h-3 w-3" />
      <span className="hidden sm:inline">Wrong Network</span>
      <span className="sm:hidden">Switch</span>
    </Button>
  );
}
