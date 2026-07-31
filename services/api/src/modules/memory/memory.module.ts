import { Module } from "@nestjs/common";
import { MemoryController } from "./memory.controller";
import { MemoryVectorService } from "./memory-vector.service";

@Module({
  controllers: [MemoryController],
  providers: [MemoryVectorService],
  exports: [MemoryVectorService],
})
export class MemoryModule {}
