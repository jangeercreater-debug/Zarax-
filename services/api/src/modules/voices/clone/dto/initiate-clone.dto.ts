import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean, IsIn, IsOptional, IsString,
  MaxLength, MinLength,
} from 'class-validator';

import { CONSENT_STATEMENT_V1, CONSENT_VERSION } from '../voice-clone.types';

export class InitiateCloneDto {
  @ApiProperty({ example: 'My Voice', maxLength: 100 })
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Base64-encoded audio file (WAV/MP3/OGG/M4A). Max 5MB, 5s-120s duration.',
  })
  @IsString() @MinLength(100)
  audioBase64!: string;

  @ApiProperty({ example: 'audio/wav' })
  @IsString()
  audioMimeType!: string;

  @ApiProperty({
    description: 'Exact consent statement text (must match server-side expected text).',
    example: CONSENT_STATEMENT_V1,
  })
  @IsString() @MinLength(50)
  consentText!: string;

  @ApiProperty({ enum: [CONSENT_VERSION], default: CONSENT_VERSION })
  @IsIn([CONSENT_VERSION])
  consentVersion!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp when user clicked consent.' })
  @IsString()
  consentedAt!: string;

  @ApiProperty({
    description: 'Must be true — user confirms this is their own voice.',
    example: true,
  })
  @IsBoolean()
  isSelfVoice!: boolean;

  @ApiProperty({ required: false, example: 'hi' })
  @IsOptional() @IsString() @MaxLength(10)
  language?: string;
}
