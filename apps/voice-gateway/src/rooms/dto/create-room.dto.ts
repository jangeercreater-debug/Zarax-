import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  agentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  participantIdentity?: string;
}
