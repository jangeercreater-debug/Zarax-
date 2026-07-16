import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IngestDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200_000) // ~40k words — generous for a single document upload
  text!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
