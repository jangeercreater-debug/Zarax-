import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

import { AgentConfigDto } from './agent-config.dto';

export class CreateAgentDto {
  @ApiProperty({ example: 'Support Bot' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ type: AgentConfigDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigDto)
  config?: AgentConfigDto;
}
