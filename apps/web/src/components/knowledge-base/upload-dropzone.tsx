'use client';

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, Link as LinkIcon, Upload, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ClientApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useIngestUrl, useUploadDocument } from '@/hooks/use-knowledge-base';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

const urlFormSchema = z.object({
  url: z.string().url('Enter a valid URL.'),
  name: z.string().max(200).optional(),
});
type UrlFormValues = z.infer<typeof urlFormSchema>;

export function UploadDropzone() {
  const uploadDocument = useUploadDocument();
  const ingestUrl = useIngestUrl();
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlForm = useForm<UrlFormValues>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: { url: '', name: '' },
  });

  const uploadFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const rejected = fileArray.filter((f) => !isAcceptedFile(f));
      if (rejected.length > 0) {
        toast.error('Unsupported file type', {
          description: `${rejected.map((f) => f.name).join(', ')} — only PDF, DOCX, and TXT are supported.`,
        });
      }

      const accepted = fileArray.filter(isAcceptedFile);
      for (const file of accepted) {
        const uploadId = `${file.name}-${Date.now()}-${Math.random()}`;
        setUploads((prev) => [...prev, { id: uploadId, file, progress: 0, status: 'uploading' }]);

        uploadDocument.mutate(
          {
            file,
            onProgress: (percent) => {
              setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress: percent } : u)));
            },
          },
          {
            onSuccess: () => {
              setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u)));
              toast.success(`${file.name} uploaded`, { description: 'Processing has started.' });
              // Clear this item from the list shortly after — the real status now
              // lives in the document list below (polling shows pending → completed).
              setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 2000);
            },
            onError: (error) => {
              const message = error instanceof ClientApiError ? error.message : 'Please try again.';
              setUploads((prev) =>
                prev.map((u) => (u.id === uploadId ? { ...u, status: 'error', errorMessage: message } : u)),
              );
            },
          },
        );
      }
    },
    [uploadDocument],
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      uploadFiles(event.target.files);
      event.target.value = ''; // allows re-selecting the same file again later
    }
  }

  function onSubmitUrl(values: UrlFormValues) {
    ingestUrl.mutate(values, {
      onSuccess: () => {
        toast.success('URL submitted', { description: 'Processing has started.' });
        urlForm.reset();
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not ingest URL', { description: message });
      },
    });
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">Upload file</TabsTrigger>
          <TabsTrigger value="url">From URL</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT — up to 20MB each</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </TabsContent>

        <TabsContent value="url">
          <Form {...urlForm}>
            <form onSubmit={urlForm.handleSubmit(onSubmitUrl)} className="space-y-4 rounded-lg border p-6">
              <FormField
                control={urlForm.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Page URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/help/faq" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={urlForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="FAQ page" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={ingestUrl.isPending}>
                <LinkIcon className="mr-2 h-4 w-4" />
                {ingestUrl.isPending ? 'Submitting…' : 'Ingest URL'}
              </Button>
            </form>
          </Form>
        </TabsContent>
      </Tabs>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 rounded-lg border p-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{upload.file.name}</p>
                {upload.status === 'uploading' && <Progress value={upload.progress} className="mt-1.5 h-1.5" />}
                {upload.status === 'error' && (
                  <p className="mt-0.5 text-xs text-destructive">{upload.errorMessage}</p>
                )}
              </div>
              {upload.status === 'error' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setUploads((prev) => prev.filter((u) => u.id !== upload.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
