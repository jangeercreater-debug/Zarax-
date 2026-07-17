import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '@zarax/api-standards';
import { CurrentPrincipal, Public } from '@zarax/shared-auth';
import type { Principal } from '@zarax/shared-types';
import type { Request } from 'express';

import { AuthService, type RequestContext } from './auth.service';
import type { AuthTokensDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const isProduction = process.env.NODE_ENV === 'production';

function requestContext(req: Request): RequestContext {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'Create a new tenant and its first (owner) user.' })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.signup(dto, requestContext(req));
  }

  @Public()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Exchange email + password for an access/refresh token pair.' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.login(dto, requestContext(req));
  }

  @Public()
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh token pair.' })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken, requestContext(req));
  }

  @Public()
  @ApiOperation({ summary: 'Revoke the session behind a refresh token.' })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto): Promise<{ success: true }> {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @ApiOperation({ summary: 'Request a password reset link. Always responds the same way, whether or not the email exists.' })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ success: true; devOnlyResetLink?: string }> {
    const link = await this.authService.forgotPassword(dto.email);
    return { success: true, ...(isProduction ? {} : { devOnlyResetLink: link }) };
  }

  @Public()
  @ApiOperation({ summary: 'Reset a password using a token from the forgot-password email.' })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: true }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }

  @Public()
  @ApiOperation({ summary: 'Verify an email address using a token from the verification email.' })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ success: true }> {
    await this.authService.verifyEmail(dto.token);
    return { success: true };
  }

  @ApiOperation({ summary: 'Resend the email verification link for the current user.' })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ success: true; devOnlyVerificationLink?: string }> {
    const link = await this.authService.resendVerification(principal);
    return { success: true, ...(isProduction ? {} : { devOnlyVerificationLink: link }) };
  }

  @ApiOperation({ summary: 'Switch to a different organization the current user belongs to.' })
  @HttpCode(HttpStatus.OK)
  @Post('switch-tenant')
  async switchTenant(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.authService.switchTenant(principal, dto.tenantId, requestContext(req));
  }
}
