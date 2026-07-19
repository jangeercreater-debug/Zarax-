import type { PrismaClient } from '@prisma/client';

interface HealthIndicatorServiceLike {
  check(key: string): { up(): unknown; down(opts: Record<string, unknown>): unknown };
}

export function createPrismaHealthIndicator(prisma: PrismaClient, healthIndicatorService: HealthIndicatorServiceLike) {
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
