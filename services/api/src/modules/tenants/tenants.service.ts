import { Injectable } from '@nestjs/common';
import { TenantRepository } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';

import type { TenantResponseDto } from './dto/tenant-response.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantRepository: TenantRepository) {}

  async getCurrentTenant(tenantId: TenantId): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepository.findByIdOrThrow(tenantId);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
    };
  }
}
