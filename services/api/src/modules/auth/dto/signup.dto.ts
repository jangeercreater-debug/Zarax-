import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'tenantSlug may only contain lowercase letters, numbers, and hyphens.',
  })
  tenantSlug!: string;
}
