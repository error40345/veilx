import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarketStats } from '@shared/schema';

interface MarketStatsProps {
  stats: MarketStats | undefined;
  isLoading: boolean;
}

export function MarketStatsSection({ stats, isLoading }: MarketStatsProps) {
  const statItems = [
    {
      label: 'Floor Price',
      value: stats?.floorPrice ? `${stats.floorPrice} ETH` : '—',
      icon: TrendingUp,
      testId: 'stat-floor-price',
    },
    {
      label: 'Total Volume',
      value: stats?.totalVolume ? `${stats.totalVolume} ETH` : '—',
      icon: Activity,
      testId: 'stat-total-volume',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {statItems.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="hover-elevate">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  {item.label}
                </p>
              </div>
              <p 
                className="text-3xl font-bold" 
                data-testid={item.testId}
              >
                {item.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
