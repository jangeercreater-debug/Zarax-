'use client';

import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useSearchKnowledgeBase } from '@/hooks/use-knowledge-base';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export function KnowledgeBaseSearch() {
  const [query, setQuery] = useState('');
  const search = useSearchKnowledgeBase();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    search.mutate(query, {
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Search failed', { description: message });
      },
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your knowledge base…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={search.isPending || !query.trim()}>
          {search.isPending ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {search.isPending && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {search.data && search.data.results.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No matching results.</p>
      )}

      {search.data && search.data.results.length > 0 && (
        <div className="space-y-3">
          {search.data.results.map((result, index) => (
            <Card key={index}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{Math.round(result.score * 100)}% match</Badge>
                </div>
                <p className="text-sm">{result.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
