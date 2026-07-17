import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { ApiEnv } from '../../config/env.schema';

@Injectable()
export class AuthEmailService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<ApiEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {}

  /** Returns the link so the caller can optionally surface it in a non-production API
   * response — see AuthController's `devOnly` response field. */
  sendVerificationEmail(email: string, rawToken: string): string {
    const link = `${this.config.get('DASHBOARD_URL')}/verify-email?token=${rawToken}`;
    this.logger.log('Email verification link generated (no email provider integrated yet)', {
      email,
      link,
    });
    return link;
  }

  sendPasswordResetEmail(email: string, rawToken: string): string {
    const link = `${this.config.get('DASHBOARD_URL')}/reset-password?token=${rawToken}`;
    this.logger.log('Password reset link generated (no email provider integrated yet)', {
      email,
      link,
    });
    return link;
  }
}
