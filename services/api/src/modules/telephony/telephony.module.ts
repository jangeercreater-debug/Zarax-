import { Module } from '@nestjs/common';

import { TelephonyController } from './telephony.controller';

@Module({ controllers: [TelephonyController] })
export class TelephonyModule {}
