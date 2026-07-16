import { Module } from '@nestjs/common';

import { UsersAuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [UsersAuthModule], // re-uses its exported TenantRepository provider
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
