import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class ExecuteWorkflowDto {
  @ApiProperty({
    required: false,
    type: 'object',
    additionalProperties: true,
    description: 'Seed input available to the workflow\'s first node (e.g. { message: "..." }).',
  })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
