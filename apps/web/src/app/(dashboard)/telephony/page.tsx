'use client';

import { useState } from 'react';
import { Phone, PhoneOff, PhoneIncoming, PhoneMissed } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useAgents } from '@/hooks/use-agents';
import {
  useActiveCalls,
  useAssignAgent,
  useCallHistory,
  useCreatePhoneNumber,
  useDeletePhoneNumber,
  usePhoneNumbers,
} from '@/hooks/use-telephony';
import type { PhoneNumber } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function AddPhoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [sipTrunkId, setSipTrunkId] = useState('');
  const create = useCreatePhoneNumber();

  function handleSubmit() {
    create.mutate({ phoneNumber, friendlyName: friendlyName || undefined, sipTrunkId: sipTrunkId || undefined }, {
      onSuccess: () => { toast.success('Phone number added'); onOpenChange(false); setPhoneNumber(''); setFriendlyName(''); setSipTrunkId(''); },
      onError: (e) => toast.error('Error', { description: e instanceof ClientApiError ? e.message : 'Try again.' }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add phone number</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Phone number (E.164)</Label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+14155552671" />
          </div>
          <div className="space-y-2">
            <Label>Friendly name (optional)</Label>
            <Input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="US Sales line" />
          </div>
          <div className="space-y-2">
            <Label>LiveKit SIP Trunk ID (optional — required for outbound)</Label>
            <Input value={sipTrunkId} onChange={(e) => setSipTrunkId(e.target.value)} placeholder="ST_..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!phoneNumber || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add number'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhoneNumberRow({ number }: { number: PhoneNumber }) {
  const { data: agents } = useAgents();
  const assign = useAssignAgent();
  const del = useDeletePhoneNumber();

  return (
    <TableRow>
      <TableCell className="font-mono">{number.phoneNumber}</TableCell>
      <TableCell>{number.friendlyName ?? '—'}</TableCell>
      <TableCell>
        <Select
          value={number.agentId ?? 'none'}
          onValueChange={(v) => assign.mutate({ id: number.id, agentId: v === 'none' ? null : v }, {
            onSuccess: () => toast.success('Agent assigned'),
            onError: (e) => toast.error(e instanceof ClientApiError ? e.message : 'Error'),
          })}
        >
          <SelectTrigger className="w-48"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del.mutate(number.id, { onSuccess: () => toast.success('Deleted'), onError: () => toast.error('Error') })}>
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function TelephonyPage() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: numbers, isLoading: numbersLoading } = usePhoneNumbers();
  const { data: calls, isLoading: callsLoading } = useCallHistory();
  const { data: active } = useActiveCalls();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Telephony</h1>
        <p className="text-sm text-muted-foreground">Manage phone numbers, view call history and active calls.</p>
      </div>

      {/* Active calls summary */}
      {active && active.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
            <Phone className="h-5 w-5 text-primary animate-pulse" />
            <p className="font-medium">{active.length} active call{active.length > 1 ? 's' : ''} right now</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="numbers">
        <TabsList>
          <TabsTrigger value="numbers">Phone Numbers</TabsTrigger>
          <TabsTrigger value="history">Call History</TabsTrigger>
          <TabsTrigger value="active">Active Calls {active?.length ? `(${active.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="numbers" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddOpen(true)}>Add number</Button>
          </div>
          {numbersLoading ? <Skeleton className="h-32 w-full" /> : (
            numbers?.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">No phone numbers yet — add one to start receiving calls.</CardContent></Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Assigned Agent</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {numbers?.map((n) => <PhoneNumberRow key={n.id} number={n} />)}
                  </TableBody>
                </Table>
              </Card>
            )
          )}
        </TabsContent>

        <TabsContent value="history">
          {callsLoading ? <Skeleton className="h-48 w-full" /> : (
            calls?.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">No calls yet.</CardContent></Card>
            ) : (
              <Card className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Direction</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Turns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls?.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          {c.direction === 'inbound'
                            ? <PhoneIncoming className="h-4 w-4 text-green-600" />
                            : <PhoneOff className="h-4 w-4 text-blue-600" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.fromNumber ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{c.toNumber ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(c.startedAt)}</TableCell>
                        <TableCell>{formatDuration(c.durationMs)}</TableCell>
                        <TableCell><Badge variant="secondary">{c.llmProvider ?? '—'}</Badge></TableCell>
                        <TableCell>{c.turnCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )
          )}
        </TabsContent>

        <TabsContent value="active">
          {!active || active.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground"><PhoneMissed className="mx-auto mb-2 h-6 w-6" />No active calls right now.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {active.map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Phone className="h-5 w-5 text-primary animate-pulse" />
                    <div>
                      <p className="font-medium">{c.fromNumber ?? 'Unknown'} → {c.toNumber ?? 'Agent'}</p>
                      <p className="text-xs text-muted-foreground">Started {formatDate(c.startedAt)} · {c.turnCount} turns · {c.llmProvider ?? '—'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddPhoneDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
