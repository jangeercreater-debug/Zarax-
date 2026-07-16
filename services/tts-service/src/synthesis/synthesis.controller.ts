import { Body, Controller, Header, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalTokenGuard } from '@zarax/shared-auth';

import { CARTESIA_REST_CLIENT } from './synthesis.module';
import type { CartesiaRestClient } from '../cartesia/cartesia-rest.client';
import { SynthesizeDto } from './dto/synthesize.dto';

@UseGuards(InternalTokenGuard)
@Controller('synthesize')
export class SynthesisController {
  constructor(@Inject(CARTESIA_REST_CLIENT) private readonly cartesiaClient: CartesiaRestClient) {}

  @Post()
  @Header('Content-Type', 'audio/wav')
  async synthesize(@Body() dto: SynthesizeDto, @Res({ passthrough: true }) res: Response): Promise<Buffer> {
    const audio = await this.cartesiaClient.synthesize({
      text: dto.text,
      voiceId: dto.voiceId,
      modelId: dto.modelId,
    });
    res.setHeader('Content-Length', audio.length);
    return audio;
  }
}
