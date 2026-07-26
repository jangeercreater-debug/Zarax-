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

/**
 * Mirrors services/llm-orchestrator's `AgentRuntimeConfig` interface (see
 * services/llm-orchestrator/src/orchestration/agent-runtime-config.ts) — kept as a
 * plain re-declaration here rather than an import, since services/api has no other
 * reason to depend on llm-orchestrator or @zarax/ai-sdk, and the two are independently
 * versioned artifacts of the same informal contract (services/api validates/stores it;
 * llm-orchestrator is the one that actually interprets it at call time).
 */
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

  @ApiProperty({
    required: false,
    enum: INTERRUPT_SENSITIVITIES,
    description: 'How readily the agent yields the floor when the caller starts speaking mid-response.',
  })
  @IsOptional()
  @IsIn(INTERRUPT_SENSITIVITIES)
  interruptSensitivity?: (typeof INTERRUPT_SENSITIVITIES)[number];

  @ApiProperty({ required: false, example: 'sonic-english-warm', description: 'Cartesia voice id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceId?: string;

  @ApiProperty({ required: false, example: 'nova-2', description: 'Deepgram STT model.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sttModel?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[];

  @ApiProperty({ required: false, description: 'Whether this agent retrieves context from the tenant knowledge base before answering.' })
  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @ApiProperty({ required: false, description: "Enable wake-word mode. Agent starts in standby and activates on hearing Zarax." })
  @IsOptional()
  @IsBoolean()
  wakeWordEnabled?: boolean;

  @ApiProperty({ required: false, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxToolIterations?: number;

  @ApiProperty({ required: false, type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  webhooks?: Record<string, string>;
}
