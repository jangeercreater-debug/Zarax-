import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { KnowledgeBaseDocument } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<
  KnowledgeBaseDocument['status'],
  { label: string; variant: 'secondary' | 'success' | 'destructive'; Icon: typeof Clock }
> = {
  pending: { label: 'Pending', variant: 'secondary', Icon: Clock },
  processing: { label: 'Processing', variant: 'secondary', Icon: Loader2 },
  completed: { label: 'Completed', variant: 'success', Icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive', Icon: XCircle },
};

export function DocumentStatusBadge({ status }: { status: KnowledgeBaseDocument['status'] }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
      {label}
    </Badge>
  );
}
