import { Module, type DynamicModule } from '@nestjs/common';

import { createPrismaClient } from '../client';
import type { PrismaClient } from '@prisma/client';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

/**
 * `createPrismaClient()` is itself a memoized singleton factory, so this module (and
 * any module-composition-time call to `createPrismaClient()` elsewhere in the same
 * service, e.g. for building a health indicator) all share the exact same instance.
 *
 * Usage — replaces what used to be a local `common/database.module.ts` per service:
 *   imports: [PrismaClientModule.forRoot()]
 *   // elsewhere: constructor(@Inject(PRISMA_CLIENT) private prisma: PrismaClient) {}
 */
@Module({})
export class PrismaClientModule {
  static forRoot(): DynamicModule {
    return {
      module: PrismaClientModule,
      global: true,
      providers: [{ provide: PRISMA_CLIENT, useFactory: (): PrismaClient => createPrismaClient() }],
      exports: [PRISMA_CLIENT],
    };
  }
}
