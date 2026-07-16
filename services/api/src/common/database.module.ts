import { Global, Module } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@zarax/database';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

/**
 * `createPrismaClient()` is itself a memoized singleton factory (see @zarax/database),
 * so calling it again here returns the exact same instance already constructed in
 * app.module.ts for the health-check indicator — this module just exposes that
 * instance through Nest's DI container for injection into repositories/services.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: (): PrismaClient => createPrismaClient(),
    },
  ],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
