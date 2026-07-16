import { Controller, Get } from '@nestjs/common';
import { CurrentPrincipal } from '@zarax/shared-auth';
import type { Principal } from '@zarax/shared-types';

import type { TenantResponseDto } from './dto/tenant-response.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * No @RequirePermission here — any authenticated principal may view their own
   * tenant's public info. Endpoints touching sensitive tenant settings (billing,
   * member management) should add @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
   * etc., following this same controller shape.
   */
  @Get('me')
  async getCurrentTenant(@CurrentPrincipal() principal: Principal): Promise<TenantResponseDto> {
    return this.tenantsService.getCurrentTenant(principal.tenantId);
  }
}
