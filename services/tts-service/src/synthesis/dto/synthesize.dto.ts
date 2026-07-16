import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SynthesizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @IsString()
  @MinLength(1)
  voiceId!: string;

  @IsOptional()
  @IsString()
  modelId?: string;
}
