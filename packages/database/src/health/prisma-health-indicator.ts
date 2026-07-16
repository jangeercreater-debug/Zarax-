import type { PrismaClient } from '@prisma/client';
import { HealthIndicatorService } from '@nestjs/terminus';

/**
 * Returns a function matching @nestjs/terminus's `HealthIndicatorFunction` shape.
 * shared-observability (Layer 2) can't own this itself since it must not depend on
 * this Layer 3 package — the consuming service imports both and wires them together:
 *
 *   HealthModule.forRoot({ indicators: [createPrismaHealthIndicator(prisma, healthIndicatorService)] })
 */
export function createPrismaHealthIndicator(
  prisma: PrismaClient,
  healthIndicatorService: HealthIndicatorService,
) {
  return async () => {
    const indicator = healthIndicatorService.check('database');
    try {
      await prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : 'unknown error' });
    }
  };
}
