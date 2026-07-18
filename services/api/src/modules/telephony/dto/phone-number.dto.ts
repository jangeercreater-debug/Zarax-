import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePhoneNumberDto {
  @ApiProperty({ example: '+14155552671' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'Must be in E.164 format.' })
  phoneNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  friendlyName?: string;

  @ApiProperty({ required: false, description: 'LiveKit SIP trunk ID for outbound calls via this number.' })
  @IsOptional()
  @IsString()
  sipTrunkId?: string;
}

export class AssignAgentDto {
  @ApiProperty({ nullable: true, description: 'Set to null to unassign.' })
  @IsOptional()
  @IsString()
  agentId!: string | null;
}
