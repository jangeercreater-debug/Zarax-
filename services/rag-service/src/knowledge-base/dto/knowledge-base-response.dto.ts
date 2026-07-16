export interface IngestDocumentResponseDto {
  documentId: string;
  chunksIndexed: number;
}

export interface SearchResultDto {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchKnowledgeBaseResponseDto {
  results: SearchResultDto[];
}
