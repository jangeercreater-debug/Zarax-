import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional,
  IsString, IsUrl, MaxLength,
} from 'class-validator';

const GENDERS = ['MALE', 'FEMALE', 'NEUTRAL'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const PROVIDERS = ['cartesia', 'openai', 'zarax'] as const;

export class UpdateVoiceDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: GENDERS, required: false })
  @IsOptional() @IsIn(GENDERS)
  gender?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(10)
  language?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional() @IsArray() @IsString({ each: true })
  languages?: string[];

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(50)
  accent?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(50)
  style?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(30)
  defaultEmotion?: string;

  @ApiProperty({ enum: PROVIDERS, required: false })
  @IsOptional() @IsIn(PROVIDERS)
  provider?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(200)
  providerVoiceId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(100)
  model?: string;

  @ApiProperty({ enum: STATUSES, required: false })
  @IsOptional() @IsIn(STATUSES)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ required: false })
  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional() @IsUrl()
  sampleAudioUrl?: string;
}
