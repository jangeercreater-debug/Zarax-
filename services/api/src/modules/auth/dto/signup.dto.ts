import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'owner@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 128, description: 'Minimum 10 characters.' })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName!: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'Lowercase letters, numbers, and hyphens only.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'tenantSlug may only contain lowercase letters, numbers, and hyphens.',
  })
  tenantSlug!: string;
}
