import { Module, type DynamicModule } from '@nestjs/common';

import { ZaraxLogger, type ZaraxLoggerOptions } from '../logger/zarax-logger.service';

export const ZARAX_LOGGER = Symbol('ZARAX_LOGGER');

@Module({})
export class LoggerModule {
  static forRoot(options: ZaraxLoggerOptions): DynamicModule {
    return {
      module: LoggerModule,
      global: true,
      providers: [
        {
          provide: ZARAX_LOGGER,
          useValue: new ZaraxLogger(options),
        },
      ],
      exports: [ZARAX_LOGGER],
    };
  }
}
