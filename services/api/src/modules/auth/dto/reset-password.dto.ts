import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128)
  newPassword!: string;
}
