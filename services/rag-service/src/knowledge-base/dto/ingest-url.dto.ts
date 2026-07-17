import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class IngestUrlDto {
  @ApiProperty({ example: 'https://example.com/help/faq' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiProperty({ required: false, example: 'FAQ page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
