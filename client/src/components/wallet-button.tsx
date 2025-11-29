import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Wallet, LogOut, ShieldCheck } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { EncryptionBadge } from './encryption-badge';

export function WalletButton() {
  const { address, isConnected, connect, disconnect } = useWallet();

  if (!isConnected) {
    return (
      <Button 
        onClick={connect}
        data-testid="button-connect-wallet"
      >
        <Wallet className="mr-2 h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  const truncatedAddress = `${address?.slice(0, 6)}...${address?.slice(-4)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" data-testid="button-wallet-menu">
          <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
          <span className="font-mono">{truncatedAddress}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Wallet Connected</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Address</span>
            <code className="text-xs font-mono">{truncatedAddress}</code>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <EncryptionBadge label="Encrypted" variant="default" />
          </div>
        </div>

        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={disconnect}
          data-testid="button-disconnect"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
