import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '@zarax/api-standards';
import { Public } from '@zarax/shared-auth';

import { AuthService } from './auth.service';
import type { AuthTokensDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'Create a new tenant and its first (owner) user.' })
  @Post('signup')
  async signup(@Body() dto: SignupDto): Promise<AuthTokensDto> {
    return this.authService.signup(dto);
  }

  @Public()
  // Stricter than the service-wide default (100/min) — login is a classic
  // brute-force target, so it gets its own tighter budget.
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Exchange email + password for an access/refresh token pair.' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.authService.login(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh token pair.' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken);
  }
}
