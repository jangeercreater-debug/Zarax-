import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class DesignVoiceDto {
  @ApiProperty({
    description: 'Natural language description of the desired voice.',
    example: 'Young Indian female voice, warm, friendly, conversational, clear Hindi and English.',
    maxLength: 500,
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  prompt!: string;
}

export class PreviewCandidateDto {
  @ApiProperty({ description: 'Provider voice ID from design candidates.' })
  @IsString()
  @MinLength(1)
  providerVoiceId!: string;

  @ApiProperty({ required: false, description: 'Custom preview text (max 200 chars).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sampleText?: string;
}

export class SaveDesignedVoiceDto {
  @ApiProperty({ example: 'My Warm Hindi Voice' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Provider voice ID from candidate.' })
  @IsString()
  @MinLength(1)
  providerVoiceId!: string;

  @ApiProperty({ description: 'Voice profile from design result.' })
  profile!: {
    gender: string;
    ageStyle: string;
    accent: string;
    tone: string;
    personality: string;
    speakingStyle: string;
    speed: number;
    energy: number;
    languages: string[];
    tags: string[];
  };
}
