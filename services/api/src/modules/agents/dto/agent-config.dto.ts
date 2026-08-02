import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const LLM_PROVIDERS = ['anthropic', 'groq', 'openai', 'gemini'] as const;
const RESPONSE_STYLES = ['concise', 'balanced', 'detailed'] as const;
const INTERRUPT_SENSITIVITIES = ['low', 'medium', 'high'] as const;
const GENDERS = ['female', 'male', 'neutral'] as const;
const VOICE_EMOTIONS = ['neutral', 'happy', 'calm', 'serious', 'friendly', 'professional'] as const;

export class AgentConfigDto {
  @ApiProperty({ required: false, example: 'Handles first-line support tickets for Acme Corp.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false, example: 'You are a friendly support agent for Acme Corp.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  systemPrompt?: string;

  @ApiProperty({ required: false, example: 'Hi! Thanks for calling Acme Corp — how can I help?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  welcomeMessage?: string;

  @ApiProperty({ required: false, enum: LLM_PROVIDERS })
  @IsOptional()
  @IsIn(LLM_PROVIDERS)
  provider?: (typeof LLM_PROVIDERS)[number];

  @ApiProperty({ required: false, enum: LLM_PROVIDERS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(LLM_PROVIDERS, { each: true })
  fallbackProviders?: (typeof LLM_PROVIDERS)[number][];

  @ApiProperty({ required: false, example: 'claude-sonnet-4-5' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false, minimum: 0, maximum: 2, example: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 8192, example: 1024 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @ApiProperty({ required: false, enum: RESPONSE_STYLES })
  @IsOptional()
  @IsIn(RESPONSE_STYLES)
  responseStyle?: (typeof RESPONSE_STYLES)[number];

  @ApiProperty({ required: false, enum: INTERRUPT_SENSITIVITIES })
  @IsOptional()
  @IsIn(INTERRUPT_SENSITIVITIES)
  interruptSensitivity?: (typeof INTERRUPT_SENSITIVITIES)[number];

  @ApiProperty({ required: false, description: 'Cartesia voice id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceId?: string;

  @ApiProperty({ required: false, description: 'Deepgram STT model.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sttModel?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  wakeWordEnabled?: boolean;

  @ApiProperty({ required: false, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxToolIterations?: number;

  @ApiProperty({ required: false, type: 'object' })
  @IsOptional()
  @IsObject()
  webhooks?: Record<string, string>;

  @ApiProperty({ required: false, description: 'Agent avatar image URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiProperty({ required: false, enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @ApiProperty({ required: false, minimum: 0.5, maximum: 2.0, description: 'Voice speaking speed multiplier.' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  voiceSpeed?: number;

  @ApiProperty({ required: false, enum: VOICE_EMOTIONS, description: 'Voice emotional tone.' })
  @IsOptional()
  @IsIn(VOICE_EMOTIONS)
  voiceEmotion?: (typeof VOICE_EMOTIONS)[number];
}
