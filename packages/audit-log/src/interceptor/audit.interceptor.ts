import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import type { Principal } from '@zarax/shared-types';
import type { Request } from 'express';
import { tap } from 'rxjs';

import { AUDIT_METADATA_KEY, type AuditedOptions } from '../decorator/audited.decorator';
import { AuditLogService } from '../audit-log.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const options = this.reflector.get<AuditedOptions | undefined>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = request.principal;

    return next.handle().pipe(
      tap(() => {
        if (!principal) return; // @Public() routes have no Principal to attribute the action to.

        const resourceId = options.resourceIdParam
          ? request.params[options.resourceIdParam]
          : undefined;

        this.auditLogService
          .record({
            principal,
            action: options.action,
            resourceType: options.resourceType,
            resourceId,
            ipAddress: request.ip,
          })
          .catch((error: unknown) => {
            // Audit logging must never break the actual response — log and move on.
            this.logger.error('Failed to record audit log entry', {
              action: options.action,
              message: error instanceof Error ? error.message : String(error),
            });
          });
      }),
    );
  }
}
