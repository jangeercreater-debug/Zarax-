import { Module, type OnModuleInit } from '@nestjs/common';
import { INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { ToolExecutorEnv } from '../config/env.schema';
import { endCallTool } from './handlers/end-call.tool';
import { getCurrentDatetimeTool } from './handlers/get-current-datetime.tool';
import { sendWebhookNotificationTool } from './handlers/send-webhook-notification.tool';
import { ToolRegistryService } from './registry/tool-registry.service';
import { ToolsController } from './tools.controller';

@Module({
  controllers: [ToolsController],
  providers: [
    ToolRegistryService,
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: (config: AppConfigService<ToolExecutorEnv>) => config.get('INTERNAL_SERVICE_TOKEN'),
      inject: [APP_CONFIG],
    },
  ],
  exports: [ToolRegistryService],
})
export class ToolsModule implements OnModuleInit {
  constructor(private readonly registry: ToolRegistryService) {}

  /**
   * Registration point for every available tool. Adding a real CRM/calendar/WhatsApp/
   * payment integration later means adding a new ToolDefinition here (and its own
   * credentials/config, owned by tool-executor per the architecture's security
   * boundary) — no changes needed to the execution/consumer plumbing.
   */
  onModuleInit(): void {
    this.registry.register(getCurrentDatetimeTool);
    this.registry.register(endCallTool);
    this.registry.register(sendWebhookNotificationTool);
  }
}
