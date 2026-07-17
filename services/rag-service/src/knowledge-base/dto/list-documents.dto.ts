import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListDocumentsDto {
  @ApiPropertyOptional({ enum: ['pending', 'processing', 'completed', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed'])
  status?: 'pending' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional({ enum: ['pdf', 'docx', 'txt', 'url'] })
  @IsOptional()
  @IsIn(['pdf', 'docx', 'txt', 'url'])
  sourceType?: 'pdf' | 'docx' | 'txt' | 'url';
}
