import { Module, type DynamicModule } from '@nestjs/common';

import { FeatureFlagService } from '../feature-flag.service';

@Module({})
export class FeatureFlagsModule {
  static forRoot(): DynamicModule {
    return {
      module: FeatureFlagsModule,
      global: true,
      providers: [FeatureFlagService],
      exports: [FeatureFlagService],
    };
  }
}
