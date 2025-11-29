import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EncryptionBadge } from '@/components/encryption-badge';
import { 
  Activity as ActivityIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Tag,
  Sparkles,
  TrendingUp,
  Clock
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'mint' | 'list' | 'sale' | 'transfer';
  nftId: string;
  nftName: string;
  nftImage: string;
  price?: string;
  role?: 'buyer' | 'seller' | 'minter' | 'lister';
  timestamp: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'mint':
      return <Sparkles className="h-5 w-5 text-green-500" />;
    case 'list':
      return <Tag className="h-5 w-5 text-blue-500" />;
    case 'sale':
      return <TrendingUp className="h-5 w-5 text-purple-500" />;
    case 'transfer':
      return <ArrowDownLeft className="h-5 w-5 text-orange-500" />;
    default:
      return <ActivityIcon className="h-5 w-5" />;
  }
}

function getActivityBadge(type: string) {
  switch (type) {
    case 'mint':
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Mint</Badge>;
    case 'list':
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Listed</Badge>;
    case 'sale':
      return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">Sale</Badge>;
    case 'transfer':
      return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Transfer</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

export default function Activity() {
  const { data: activities = [], isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['/api/activity'],
    queryFn: async () => {
      const res = await fetch('/api/activity?limit=50');
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <ActivityIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold" data-testid="text-activity-title">
              Activity
            </h1>
          </div>
          <p className="text-muted-foreground">
            Recent marketplace transactions with encrypted identities
          </p>
        </div>

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <EncryptionBadge label="Identities Encrypted" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-5 w-1/3 mb-2" />
                      <Skeleton className="h-4 w-1/4 mb-2" />
                      <Skeleton className="h-4 w-1/5" />
                    </div>
                    <div className="text-right">
                      <Skeleton className="h-6 w-24 mb-2" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="py-16 text-center">
                <ActivityIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
                <p className="text-muted-foreground">
                  Marketplace transactions will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {activities.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center gap-4 p-4 hover-elevate transition-colors"
                    data-testid={`activity-row-${item.id}`}
                  >
                    {/* NFT Image */}
                    <div className="relative flex-shrink-0">
                      <img 
                        src={item.nftImage} 
                        alt={item.nftName}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 shadow">
                        {getActivityIcon(item.type)}
                      </div>
                    </div>

                    {/* Activity Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate mb-1" data-testid={`text-nft-name-${item.id}`}>
                        {item.nftName}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActivityBadge(item.type)}
                        {item.type === 'sale' && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <EncryptionBadge label="Buyer" size="sm" />
                            <ArrowUpRight className="h-3 w-3" />
                            <EncryptionBadge label="Seller" size="sm" />
                          </div>
                        )}
                        {item.type === 'list' && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>by</span>
                            <EncryptionBadge label="Seller" size="sm" />
                          </div>
                        )}
                        {item.type === 'mint' && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>by</span>
                            <EncryptionBadge label="Minter" size="sm" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Price and Time */}
                    <div className="text-right flex-shrink-0">
                      {item.price && (
                        <p className="font-mono font-bold text-lg" data-testid={`text-price-${item.id}`}>
                          {item.price} ETH
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {formatDate(item.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
