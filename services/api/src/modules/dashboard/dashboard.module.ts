import { Module } from "@nestjs/common";
import { RedisCacheModule } from "@zarax/redis-client";
import { DashboardController } from "./dashboard.controller";

@Module({
  imports: [RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? "" })],
  controllers: [DashboardController],
})
export class DashboardModule {}
