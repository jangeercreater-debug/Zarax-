'use client';

import { useState } from 'react';
import Link from 'next/link';
import { History, MoreVertical, Pencil, Trash2 } from 'lucide-react';

import type { Agent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteAgentDialog } from './delete-agent-dialog';

function AgentActionsMenu({ agent, onDelete }: { agent: Agent; onDelete: (agent: Agent) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${agent.name}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/agents/${agent.id}`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/agents/${agent.id}/versions`}>
            <History className="mr-2 h-4 w-4" />
            Version history
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(agent)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AgentListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function AgentEmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium">No agents yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create your first voice agent to start handling calls.
        </p>
        <Button asChild>
          <Link href="/agents/new">Create your first agent</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AgentList({ agents }: { agents: Agent[] }) {
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  if (agents.length === 0) return <AgentEmptyState />;

  return (
    <>
      {/* Desktop: table */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">
                  <Link href={`/agents/${agent.id}`} className="hover:underline">
                    {agent.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {agent.config.provider ?? 'Default'}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">v{agent.currentVersion}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={agent.isActive ? 'success' : 'secondary'}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <AgentActionsMenu agent={agent} onDelete={setAgentToDelete} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <Link href={`/agents/${agent.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{agent.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="secondary">v{agent.currentVersion}</Badge>
                  <Badge variant={agent.isActive ? 'success' : 'secondary'}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </Link>
              <AgentActionsMenu agent={agent} onDelete={setAgentToDelete} />
            </CardContent>
          </Card>
        ))}
      </div>

      {agentToDelete && (
        <DeleteAgentDialog
          agentId={agentToDelete.id}
          agentName={agentToDelete.name}
          open={Boolean(agentToDelete)}
          onOpenChange={(open) => !open && setAgentToDelete(null)}
        />
      )}
    </>
  );
}
