import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PreviewVoiceDto {
  @ApiProperty({
    required: false,
    example: 'Hi! I am Zarax. How can I help you today?',
    description: 'Sample text for voice preview. Max 200 characters.',
  })
  @IsOptional() @IsString() @MaxLength(200)
  sampleText?: string;

  /**
   * Phase 5: Speed control (REAL on Kokoro-82M).
   * Wired to KPipeline speed= param.
   */
  @ApiProperty({ required: false, default: 1.0, minimum: 0.5, maximum: 2.0 })
  @IsOptional() @IsNumber() @Min(0.5) @Max(2.0)
  speed?: number;

  /**
   * Phase 5: Language selection (REAL on Kokoro-82M).
   * Wired to KPipeline lang_code= param.
   */
  @ApiProperty({ required: false, example: 'en', description: 'BCP-47 language tag.' })
  @IsOptional() @IsString() @MaxLength(10)
  language?: string;
}
