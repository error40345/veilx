import { Button } from '@/components/ui/button';
import { ShieldCheck, EyeOff, TrendingUp } from 'lucide-react';
import heroImage from '@assets/generated_images/veilx_hero_background_image.png';
import { useWallet } from '@/lib/wallet';

export function HeroSection() {
  const { isConnected, connect } = useWallet();

  return (
    <div className="relative h-[80vh] min-h-[600px] w-full overflow-hidden">
      {/* Hero Image with Dark Gradient Overlay */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Encrypted NFT Marketplace"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
      </div>

      {/* Hero Content */}
      <div className="relative flex h-full items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <h1 className="font-display text-5xl font-bold text-primary-foreground sm:text-6xl lg:text-7xl mb-6">
              The Future of{' '}
              <span className="text-primary">Private</span>{' '}
              NFT Trading
            </h1>
            
            <p className="text-xl text-primary-foreground/90 sm:text-2xl mb-8 max-w-2xl">
              Public transparency. Private identities. 
              Trade NFTs with complete privacy using Zama FHE encryption.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3 mb-10">
              <div className="flex items-center gap-2 bg-primary/10 backdrop-blur-md border border-primary/20 rounded-lg px-4 py-2">
                <ShieldCheck className="h-5 w-5 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">Encrypted Identities</span>
              </div>
              <div className="flex items-center gap-2 bg-primary/10 backdrop-blur-md border border-primary/20 rounded-lg px-4 py-2">
                <EyeOff className="h-5 w-5 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">Private Trading</span>
              </div>
              <div className="flex items-center gap-2 bg-primary/10 backdrop-blur-md border border-primary/20 rounded-lg px-4 py-2">
                <TrendingUp className="h-5 w-5 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">Public Prices</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4">
              {!isConnected ? (
                <Button
                  size="lg"
                  onClick={connect}
                  className="px-8 backdrop-blur-md bg-primary border border-primary-border"
                  data-testid="button-connect-wallet-hero"
                >
                  Connect Wallet
                </Button>
              ) : (
                <Button
                  size="lg"
                  asChild
                  className="px-8 backdrop-blur-md bg-primary border border-primary-border"
                  data-testid="button-explore-marketplace"
                >
                  <a href="#marketplace">Explore Marketplace</a>
                </Button>
              )}
              
              <Button
                size="lg"
                variant="outline"
                className="px-8 backdrop-blur-md bg-background/10 border-primary-foreground/20 text-primary-foreground hover:bg-background/20"
                data-testid="button-learn-more"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
