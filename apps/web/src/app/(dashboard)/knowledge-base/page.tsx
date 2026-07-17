'use client';

import { DocumentList } from '@/components/knowledge-base/document-list';
import { KnowledgeBaseSearch } from '@/components/knowledge-base/search-panel';
import { UploadDropzone } from '@/components/knowledge-base/upload-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="text-sm text-muted-foreground">
          Upload documents or add web pages so your agents can answer from them.
        </p>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="upload">Add content</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentList />
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Add content</CardTitle>
              <CardDescription>PDF, DOCX, TXT files, or a web page URL.</CardDescription>
            </CardHeader>
            <CardContent>
              <UploadDropzone />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>Search</CardTitle>
              <CardDescription>Test what your agents will retrieve for a given query.</CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeBaseSearch />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
