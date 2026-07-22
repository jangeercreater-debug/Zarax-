import { Controller, Get, Param, UseGuards, Inject } from '@nestjs/common';
import { InternalTokenGuard, Public } from '@zarax/shared-auth';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { NotFoundError } from '@zarax/shared-errors';

/** Fetched by voice-runtime at call-start to get the agent's voiceId, sttModel,
 * welcomeMessage, and systemPrompt. No JWT — protected by the shared INTERNAL_SERVICE_TOKEN. */
// @Public() exempts this route from the global JWT auth guard -- it is not
// tenant-facing traffic. Authentication is the shared INTERNAL_SERVICE_TOKEN
// checked by InternalTokenGuard below, the same pattern the LiveKit webhook uses.
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/agents')
export class InternalAgentController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @Get(':agentId/config')
  async getAgentConfig(
    @Param('agentId') agentId: string,
  ): Promise<{ config: Record<string, unknown> }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId, deletedAt: null },
      select: { config: true },
    });
    if (!agent) throw new NotFoundError('Agent', agentId);
    return { config: agent.config as Record<string, unknown> };
  }
}
