import { useState, useEffect } from 'react';
import { Shield, Store, Activity, User, Rocket, Wallet } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { WalletButton } from './wallet-button';
import { ThemeToggle } from './theme-toggle';
import { NetworkIndicator } from './network-indicator';
import { PrivacyPoolModal } from './privacy-pool-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/lib/wallet';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { ethers } from 'ethers';

interface PoolBalance {
  accountHash: string;
  balance: string;
  totalDeposited: string;
  totalSpent: string;
}

export function Navbar() {
  const [location] = useLocation();
  const { isConnected, address } = useWallet();
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [accountHash, setAccountHash] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
      setAccountHash(hash);
    } else {
      setAccountHash(null);
    }
  }, [address]);

  const { data: poolBalance } = useQuery<PoolBalance>({
    queryKey: ['/api/pool/balance', accountHash],
    enabled: isConnected && !!accountHash,
    refetchInterval: 30000,
  });

  const balance = parseFloat(poolBalance?.balance || '0');

  const navLinks = [
    { href: '/', label: 'Marketplace', icon: Store },
    { href: '/collections', label: 'Collections', icon: Rocket },
    { href: '/activity', label: 'Activity', icon: Activity },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display text-xl font-bold">VeilX</h1>
                <p className="text-[10px] text-muted-foreground">Encrypted NFT Marketplace</p>
              </div>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={location === link.href ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    "gap-2",
                    location === link.href && "bg-secondary"
                  )}
                  data-testid={`nav-${link.label.toLowerCase()}`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Button>
              </Link>
            ))}
            {isConnected && (
              <Link href="/profile">
                <Button
                  variant={location === '/profile' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    "gap-2",
                    location === '/profile' && "bg-secondary"
                  )}
                  data-testid="nav-profile"
                >
                  <User className="h-4 w-4" />
                  Profile
                </Button>
              </Link>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Privacy Pool Button */}
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 hidden sm:flex"
                onClick={() => setIsPoolModalOpen(true)}
                data-testid="button-privacy-pool"
              >
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">Pool</span>
                {balance > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {balance.toFixed(3)}
                  </Badge>
                )}
              </Button>
            )}
            
            {/* Mobile pool button */}
            {isConnected && (
              <Button
                variant="outline"
                size="icon"
                className="sm:hidden"
                onClick={() => setIsPoolModalOpen(true)}
                data-testid="button-privacy-pool-mobile"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
            
            {/* Mobile nav links */}
            <div className="flex md:hidden items-center gap-1">
              <Link href="/">
                <Button
                  variant={location === '/' ? 'secondary' : 'ghost'}
                  size="icon"
                  data-testid="nav-marketplace-mobile"
                >
                  <Store className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/collections">
                <Button
                  variant={location === '/collections' ? 'secondary' : 'ghost'}
                  size="icon"
                  data-testid="nav-collections-mobile"
                >
                  <Rocket className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/activity">
                <Button
                  variant={location === '/activity' ? 'secondary' : 'ghost'}
                  size="icon"
                  data-testid="nav-activity-mobile"
                >
                  <Activity className="h-4 w-4" />
                </Button>
              </Link>
              {isConnected && (
                <Link href="/profile">
                  <Button
                    variant={location === '/profile' ? 'secondary' : 'ghost'}
                    size="icon"
                    data-testid="nav-profile-mobile"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
            <NetworkIndicator />
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
      </div>
      
      <PrivacyPoolModal 
        isOpen={isPoolModalOpen} 
        onClose={() => setIsPoolModalOpen(false)} 
      />
    </nav>
  );
}
