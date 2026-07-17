import { Module } from '@nestjs/common';
import { PRISMA_CLIENT, TenantRepository, UserRepository, type PrismaClient } from '@zarax/database';

import { AuthController } from './auth.controller';
import { AuthEmailService } from './auth-email.service';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthEmailService,
    {
      provide: UserRepository,
      useFactory: (prisma: PrismaClient) => new UserRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: TenantRepository,
      useFactory: (prisma: PrismaClient) => new TenantRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
  exports: [TenantRepository, UserRepository],
})
export class UsersAuthModule {}
