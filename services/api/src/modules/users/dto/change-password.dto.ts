import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128)
  newPassword!: string;
}
