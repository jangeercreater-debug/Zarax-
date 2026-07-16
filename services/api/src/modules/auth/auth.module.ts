import { Module } from '@nestjs/common';
import { TenantRepository, UserRepository, type PrismaClient } from '@zarax/database';

import { PRISMA_CLIENT } from '../../common/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
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
  exports: [TenantRepository],
})
export class UsersAuthModule {}
