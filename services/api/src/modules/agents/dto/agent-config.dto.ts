import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const LLM_PROVIDERS = ['anthropic', 'groq', 'openai', 'gemini'] as const;

/**
 * Mirrors services/llm-orchestrator's `AgentRuntimeConfig` interface (see
 * services/llm-orchestrator/src/orchestration/agent-runtime-config.ts) — kept as a
 * plain re-declaration here rather than an import, since services/api has no other
 * reason to depend on llm-orchestrator or @zarax/ai-sdk, and the two are independently
 * versioned artifacts of the same informal contract (services/api validates/stores it;
 * llm-orchestrator is the one that actually interprets it at call time).
 */
export class AgentConfigDto {
  @ApiProperty({ required: false, example: 'You are a friendly support agent for Acme Corp.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  systemPrompt?: string;

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

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTools?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

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
