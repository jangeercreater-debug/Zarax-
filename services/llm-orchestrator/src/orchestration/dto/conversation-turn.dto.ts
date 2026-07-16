import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConversationTurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  text!: string;

  @IsString()
  @MinLength(1)
  agentId!: string;
}
