import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

/** The known node types the visual editor and workflow-engine's executors both
 * understand. Each node's `data` is intentionally loosely-typed here (validated only
 * as "an object") — deep, type-specific validation of a node's config (e.g. an
 * ai_agent node's agentId, a condition node's expression) happens once, in
 * services/workflow-engine at execution time, rather than being duplicated in two
 * places with two different validation libraries. */
export const WORKFLOW_NODE_TYPES = [
  'trigger',
  'ai_agent',
  'knowledge_base',
  'condition',
  'delay',
  'webhook',
  'http_request',
  'email',
  'end',
] as const;

export class NodePositionDto {
  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;
}

export class WorkflowNodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({ enum: WORKFLOW_NODE_TYPES })
  @IsIn(WORKFLOW_NODE_TYPES)
  type!: (typeof WORKFLOW_NODE_TYPES)[number];

  @ApiProperty({ type: NodePositionDto })
  @ValidateNested()
  @Type(() => NodePositionDto)
  position!: NodePositionDto;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;
}
