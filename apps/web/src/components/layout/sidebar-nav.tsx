'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Library, Workflow } from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/knowledge-base', label: 'Knowledge Base', icon: Library },
  // Additional sections (Calls, Analytics, Settings, ...) land here as they're built —
  // kept to what's actually implemented today rather than linking to empty pages.
] satisfies Array<{ href: string; label: string; icon: typeof Bot }>;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">
          Z
        </div>
        <span className="text-lg font-semibold tracking-tight">ZaraX</span>
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
