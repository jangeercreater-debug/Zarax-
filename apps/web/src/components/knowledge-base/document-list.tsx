'use client';

import { useState } from 'react';
import { FileText, Globe, MoreVertical, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';
import { useDeleteDocument, useDocuments, useReindexDocument, type DocumentFilters } from '@/hooks/use-knowledge-base';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentStatusBadge } from './document-status-badge';

const SOURCE_ICONS = { pdf: FileText, docx: FileText, txt: FileText, url: Globe } as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function DocumentActionsMenu({
  document,
  onDelete,
}: {
  document: KnowledgeBaseDocument;
  onDelete: (document: KnowledgeBaseDocument) => void;
}) {
  const reindexDocument = useReindexDocument();

  function handleReindex() {
    reindexDocument.mutate(document.id, {
      onSuccess: () => toast.success('Re-indexing started'),
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not re-index', { description: message });
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${document.name}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleReindex} disabled={reindexDocument.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Re-index
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(document)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteDocumentDialog({
  document,
  open,
  onOpenChange,
}: {
  document: KnowledgeBaseDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteDocument = useDeleteDocument();

  function handleConfirm() {
    if (!document) return;
    deleteDocument.mutate(document.id, {
      onSuccess: () => {
        toast.success('Document deleted');
        onOpenChange(false);
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not delete document', { description: message });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{document?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This removes the document and every indexed chunk from the knowledge base. This can&rsquo;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteDocument.isPending}>
            {deleteDocument.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentList() {
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [documentToDelete, setDocumentToDelete] = useState<KnowledgeBaseDocument | null>(null);
  const { data: documents, isLoading, isError } = useDocuments(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) => setFilters((f) => ({ ...f, status: value === 'all' ? undefined : (value as DocumentFilters['status']) }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.sourceType ?? 'all'}
          onValueChange={(value) => setFilters((f) => ({ ...f, sourceType: value === 'all' ? undefined : (value as DocumentFilters['sourceType']) }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="docx">DOCX</SelectItem>
            <SelectItem value="txt">TXT</SelectItem>
            <SelectItem value="url">URL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load documents. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {documents && documents.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No documents yet — upload a file or add a URL above.
          </CardContent>
        </Card>
      )}

      {documents && documents.length > 0 && (
        <>
          {/* Desktop: table */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const Icon = SOURCE_ICONS[doc.sourceType];
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-xs truncate font-medium">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{doc.name}</span>
                        </div>
                        {doc.status === 'failed' && doc.errorMessage && (
                          <p className="mt-0.5 truncate text-xs text-destructive">{doc.errorMessage}</p>
                        )}
                      </TableCell>
                      <TableCell className="uppercase text-muted-foreground">{doc.sourceType}</TableCell>
                      <TableCell>
                        <DocumentStatusBadge status={doc.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.chunkCount}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>
                        <DocumentActionsMenu document={doc} onDelete={setDocumentToDelete} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {documents.map((doc) => {
              const Icon = SOURCE_ICONS[doc.sourceType];
              return (
                <Card key={doc.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doc.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <DocumentStatusBadge status={doc.status} />
                          <span className="text-xs text-muted-foreground">{doc.chunkCount} chunks</span>
                        </div>
                      </div>
                    </div>
                    <DocumentActionsMenu document={doc} onDelete={setDocumentToDelete} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <DeleteDocumentDialog
        document={documentToDelete}
        open={Boolean(documentToDelete)}
        onOpenChange={(open) => !open && setDocumentToDelete(null)}
      />
    </div>
  );
}
