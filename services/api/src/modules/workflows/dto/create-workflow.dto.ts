import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

import { WorkflowDefinitionDto } from './workflow-definition.dto';

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Post-call follow-up' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, example: 'Sends a summary and checks the knowledge base for related articles.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: WorkflowDefinitionDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition?: WorkflowDefinitionDto;

  @ApiProperty({ required: false, default: false, description: 'Publish immediately instead of creating as a draft (the default).' })
  @IsOptional()
  @IsBoolean()
  publishOnCreate?: boolean;
}
