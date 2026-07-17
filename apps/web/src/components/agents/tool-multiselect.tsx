'use client';

import { ChevronDown } from 'lucide-react';

import type { ToolCatalogEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

interface ToolMultiSelectProps {
  tools: ToolCatalogEntry[] | undefined;
  isLoading: boolean;
  value: string[];
  onChange: (value: string[]) => void;
}

export function ToolMultiSelect({ tools, isLoading, value, onChange }: ToolMultiSelectProps) {
  if (isLoading) return <Skeleton className="h-9 w-full max-w-sm" />;

  function toggle(toolName: string, checked: boolean) {
    onChange(checked ? [...value, toolName] : value.filter((name) => name !== toolName));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full max-w-sm justify-between font-normal">
          {value.length === 0 ? 'No tools enabled' : `${value.length} tool${value.length === 1 ? '' : 's'} enabled`}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuLabel>Available tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!tools || tools.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No tools available.</p>
        ) : (
          tools.map((tool) => (
            <DropdownMenuCheckboxItem
              key={tool.name}
              checked={value.includes(tool.name)}
              onCheckedChange={(checked) => toggle(tool.name, checked)}
              onSelect={(event) => event.preventDefault()}
            >
              <div>
                <p>{tool.name}</p>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
