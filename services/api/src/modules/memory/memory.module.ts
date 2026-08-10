import { Module } from "@nestjs/common";
import { INTERNAL_SERVICE_TOKEN } from "@zarax/shared-auth";
import { MemoryController } from "./memory.controller";
import { InternalMemoryController } from "./internal-memory.controller";
import { MemoryService } from "./memory.service";
import { MemoryVectorService } from "./memory-vector.service";

@Module({
  controllers: [MemoryController, InternalMemoryController],
  providers: [
    MemoryService,
    MemoryVectorService,
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: () => process.env.INTERNAL_SERVICE_TOKEN ?? "",
    },
  ],
  exports: [MemoryService, MemoryVectorService],
})
export class MemoryModule {}
