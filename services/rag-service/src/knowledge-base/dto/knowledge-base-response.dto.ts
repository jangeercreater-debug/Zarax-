export interface IngestDocumentResponseDto {
  documentId: string;
  chunksIndexed: number;
}

export interface DocumentResponseDto {
  id: string;
  name: string;
  sourceType: 'pdf' | 'docx' | 'txt' | 'url';
  sourceUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultDto {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchKnowledgeBaseResponseDto {
  results: SearchResultDto[];
}
