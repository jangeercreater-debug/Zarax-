import { Module } from '@nestjs/common';
import { MemoryClient } from './memory-client';

@Module({
  providers: [MemoryClient],
  exports: [MemoryClient],
})
export class MemoryClientModule {}
