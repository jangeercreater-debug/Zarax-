import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class WorkflowEdgeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  source!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  target!: string;

  /** Used by condition nodes to distinguish the true/false branch a given edge
   * represents (e.g. 'true' | 'false') — opaque to services/api, interpreted only by
   * workflow-engine's ConditionNodeExecutor. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetHandle?: string;
}
