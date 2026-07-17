'use client';

import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useCurrentTenant } from '@/hooks/use-auth';
import { useMemberships, useSwitchTenant } from '@/hooks/use-organizations';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export function OrganizationSwitcher() {
  const { data: currentTenant, isLoading: tenantLoading } = useCurrentTenant();
  const { data: memberships, isLoading: membershipsLoading } = useMemberships();
  const switchTenant = useSwitchTenant();

  if (tenantLoading || membershipsLoading) {
    return <Skeleton className="h-8 w-40" />;
  }

  // A single-organization user (today's only signup path) sees their organization
  // name as plain text — the switcher UI only appears once there's something to
  // switch between, rather than showing a dropdown with one disabled option.
  if (!memberships || memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Building2 className="h-4 w-4" />
        {currentTenant?.name}
      </div>
    );
  }

  function handleSwitch(tenantId: string) {
    if (tenantId === currentTenant?.id) return;
    switchTenant.mutate(tenantId, {
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not switch organization', { description: message });
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-2 px-2 text-sm font-medium">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[140px] truncate">{currentTenant?.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.tenantId}
            onClick={() => handleSwitch(membership.tenantId)}
            className="flex items-center justify-between"
          >
            <div className="min-w-0">
              <p className="truncate">{membership.tenantName}</p>
              <p className="text-xs capitalize text-muted-foreground">{membership.role.toLowerCase()}</p>
            </div>
            {membership.tenantId === currentTenant?.id && (
              <Check className={cn('h-4 w-4 shrink-0')} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
