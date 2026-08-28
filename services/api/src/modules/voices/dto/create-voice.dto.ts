import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional,
  IsString, IsUrl, MaxLength, MinLength,
} from 'class-validator';

const VOICE_TYPES = ['CUSTOM', 'GENERATED', 'CLONED', 'MARKETPLACE'] as const;
const GENDERS = ['MALE', 'FEMALE', 'NEUTRAL'] as const;
const PROVIDERS = ['cartesia', 'openai', 'zarax'] as const;

export class CreateVoiceDto {
  @ApiProperty({ example: 'My Custom Voice' })
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: VOICE_TYPES, default: 'CUSTOM' })
  @IsOptional() @IsIn(VOICE_TYPES)
  voiceType?: string;

  @ApiProperty({ enum: GENDERS, default: 'NEUTRAL' })
  @IsOptional() @IsIn(GENDERS)
  gender?: string;

  @ApiProperty({ example: 'en', default: 'en' })
  @IsOptional() @IsString() @MaxLength(10)
  language?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional() @IsArray() @IsString({ each: true })
  languages?: string[];

  @ApiProperty({ required: false, example: 'Indian' })
  @IsOptional() @IsString() @MaxLength(50)
  accent?: string;

  @ApiProperty({ required: false, example: 'young-adult' })
  @IsOptional() @IsString() @MaxLength(20)
  ageRange?: string;

  @ApiProperty({ required: false, example: 'conversational' })
  @IsOptional() @IsString() @MaxLength(50)
  style?: string;

  @ApiProperty({ required: false, example: 'neutral' })
  @IsOptional() @IsString() @MaxLength(30)
  defaultEmotion?: string;

  @ApiProperty({ enum: PROVIDERS, required: false })
  @IsOptional() @IsIn(PROVIDERS)
  provider?: string;

  @ApiProperty({ required: false, description: 'Provider-specific voice ID' })
  @IsOptional() @IsString() @MaxLength(200)
  providerVoiceId?: string;

  @ApiProperty({ required: false, example: 'sonic-2' })
  @IsOptional() @IsString() @MaxLength(100)
  model?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(200)
  speakerId?: string;

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
