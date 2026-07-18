import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class DialOutboundDto {
  @ApiProperty({ example: 'agent-uuid' })
  @IsString()
  @MinLength(1)
  agentId!: string;

  @ApiProperty({ example: '+14155552671', description: 'E.164 format phone number to dial.' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'toNumber must be in E.164 format (e.g. +14155552671).' })
  toNumber!: string;

  @ApiProperty({ required: false, example: '+18005550100' })
  @IsOptional()
  @IsString()
  fromNumber?: string;
}
