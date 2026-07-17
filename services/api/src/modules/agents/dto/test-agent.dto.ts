import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class TestAgentDto {
  @ApiProperty({ example: 'Hi, what are your business hours?' })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  message!: string;
}
