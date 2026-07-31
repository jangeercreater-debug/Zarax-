import { Controller, Post, Body } from '@nestjs/common';
import { SummaryService } from './summary.service';

@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Post()
  async generate(
    @Body() body: { tenantId: string; callId: string; userId: string },
  ): Promise<{ status: string }> {
    void this.summaryService.generateAndStore(body.tenantId, body.callId, body.userId);
    return { status: 'accepted' };
  }
}
