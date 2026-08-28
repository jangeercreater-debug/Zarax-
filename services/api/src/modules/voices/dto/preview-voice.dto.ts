import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PreviewVoiceDto {
  @ApiProperty({
    required: false,
    example: 'Hi! I am Zarax. How can I help you today?',
    description: 'Sample text for voice preview. Max 200 characters.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sampleText?: string;
}
