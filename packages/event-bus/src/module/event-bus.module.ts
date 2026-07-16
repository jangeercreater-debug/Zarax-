import { Module, type DynamicModule } from '@nestjs/common';

import { RedisEventBusService, type EventBusLogger } from '../service/redis-event-bus.service';

export const EVENT_BUS = Symbol('EVENT_BUS');

interface EventBusModuleOptions {
  redisUrl: string;
  logger?: EventBusLogger;
}

@Module({})
export class EventBusModule {
  static forRoot(options: EventBusModuleOptions): DynamicModule {
    return {
      module: EventBusModule,
      global: true,
      providers: [
        {
          provide: EVENT_BUS,
          useValue: new RedisEventBusService(options.redisUrl, options.logger),
        },
      ],
      exports: [EVENT_BUS],
    };
  }
}
