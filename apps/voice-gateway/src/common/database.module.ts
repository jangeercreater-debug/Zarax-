import { Global, Module } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@zarax/database';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Global()
@Module({
  providers: [{ provide: PRISMA_CLIENT, useFactory: (): PrismaClient => createPrismaClient() }],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule {}
