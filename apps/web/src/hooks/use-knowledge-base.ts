'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ClientApiError, clientRequest } from '@/lib/api-client';
import type { KnowledgeBaseDocument, KnowledgeBaseSearchResult } from '@/lib/types';

const documentsKey = ['knowledge-base', 'documents'] as const;

export interface DocumentFilters {
  status?: KnowledgeBaseDocument['status'];
  sourceType?: KnowledgeBaseDocument['sourceType'];
}

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: [...documentsKey, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.sourceType) params.set('sourceType', filters.sourceType);
      const qs = params.toString();
      return clientRequest<KnowledgeBaseDocument[]>(`/knowledge-base/documents${qs ? `?${qs}` : ''}`);
    },
    // Polls every 3s while anything is still pending/processing, so status updates
    // (completed/failed) show up without a manual refresh — stops polling once
    // everything has settled.
    refetchInterval: (query) => {
      const docs = query.state.data;
      const stillProcessing = docs?.some((d) => d.status === 'pending' || d.status === 'processing');
      return stillProcessing ? 3000 : false;
    },
  });
}

/** Real upload progress via XMLHttpRequest — fetch() has no upload-progress event,
 * only XHR exposes `upload.onprogress`. Everything else in this app uses fetch; this
 * is the one deliberate exception, scoped to exactly the case that needs it. */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => {
      return new Promise<KnowledgeBaseDocument>((resolve, reject) => {
        const formData = new FormData();
        formData.set('file', file, file.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/knowledge-base/documents/upload');
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText) as
              | { data: KnowledgeBaseDocument }
              | { error: { code: string; message: string; requestId: string } };
            if (xhr.status >= 200 && xhr.status < 300 && 'data' in parsed) {
              resolve(parsed.data);
            } else if ('error' in parsed) {
              reject(new ClientApiError(parsed.error.code, parsed.error.message, xhr.status, parsed.error.requestId));
            } else {
              reject(new ClientApiError('UNKNOWN_ERROR', 'Upload failed.', xhr.status, 'unknown'));
            }
          } catch {
            reject(new ClientApiError('UNKNOWN_ERROR', 'Upload failed.', xhr.status, 'unknown'));
          }
        };

        xhr.onerror = () => reject(new ClientApiError('NETWORK_ERROR', 'Upload failed — check your connection.', 0, 'unknown'));
        xhr.send(formData);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
}

export function useIngestUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; name?: string }) =>
      clientRequest<KnowledgeBaseDocument>('/knowledge-base/documents/url', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      clientRequest<{ success: true }>(`/knowledge-base/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
}

export function useReindexDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      clientRequest<KnowledgeBaseDocument>(`/knowledge-base/documents/${id}/reindex`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
}

export function useSearchKnowledgeBase() {
  return useMutation({
    mutationFn: (query: string) =>
      clientRequest<{ results: KnowledgeBaseSearchResult[] }>('/knowledge-base/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  });
}
