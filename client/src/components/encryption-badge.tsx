import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EncryptionBadgeProps {
  label?: string;
  tooltip?: string;
  variant?: 'default' | 'outline';
}

export function EncryptionBadge({ 
  label = 'Encrypted', 
  tooltip = 'This information is encrypted using Zama FHE',
  variant = 'outline'
}: EncryptionBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant={variant} 
          className="gap-1.5"
          data-testid="badge-encrypted"
        >
          <Lock className="h-3 w-3" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
