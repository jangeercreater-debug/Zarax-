import { Module } from '@nestjs/common';

import { ToolCatalogClient } from './tool-catalog.client';

@Module({
  providers: [ToolCatalogClient],
  exports: [ToolCatalogClient],
})
export class ToolCatalogModule {}
